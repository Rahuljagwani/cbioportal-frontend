import * as React from 'react';
import * as _ from "lodash";
import {CancerStudy, DiscreteCopyNumberData} from "shared/api/generated/CBioPortalAPI";
import {
    IAnnotation, IAnnotationColumnProps, default as DefaultAnnotationColumnFormatter
} from "shared/components/mutationTable/column/AnnotationColumnFormatter";
import {IOncoKbData, IOncoKbDataWrapper} from "shared/model/OncoKB";
import OncoKB from "shared/components/annotation/OncoKB";
import Civic from "shared/components/annotation/Civic";
import PharmacoDB from "shared/components/annotation/PharmacoDB";
import {generateQueryVariantId, generateQueryVariant} from "shared/lib/OncoKbUtils";
import {IndicatorQueryResp, Query} from "shared/api/generated/OncoKbAPI";
import {getAlterationString} from "shared/lib/CopyNumberUtils";
import {ICivicVariant, ICivicGene, ICivicEntry, ICivicVariantData, ICivicGeneData, ICivicGeneDataWrapper, ICivicVariantDataWrapper} from "shared/model/Civic.ts";
import {buildCivicEntry, getCivicCNAVariants} from "shared/lib/CivicUtils";
import { IPharmacoDBCnaEntry, IPharmacoDBView, IPharmacoDBViewList, IPharmacoDBViewListDataWrapper } from 'shared/model/PharmacoDB';

/**
 * @author Selcuk Onur Sumer
 */
export default class AnnotationColumnFormatter
{
    public static getData(copyNumberData:DiscreteCopyNumberData[]|undefined,
                          oncoKbAnnotatedGenes:{[entrezGeneId:number]:boolean}|Error,
                          oncoKbData?: IOncoKbDataWrapper,
                          civicGenes?: ICivicGeneDataWrapper,
                          civicVariants?: ICivicVariantDataWrapper,
                          uniqueSampleKeyToOncoTreeCode?:{[uniqueSampleKey: string]: string},
                          cnaPharmacoDBViewListDW? : IPharmacoDBViewListDataWrapper,
                          studyIdToStudy?: {[studyId:string]:CancerStudy})
    {
        let value: IAnnotation;

        if (copyNumberData)
        {
            let oncoKbIndicator: IndicatorQueryResp|undefined = undefined;
            let oncoKbStatus:IAnnotation["oncoKbStatus"] = "complete";
            let hugoGeneSymbol = copyNumberData[0].gene.hugoGeneSymbol;
            const oncoKbGeneExist = !(oncoKbAnnotatedGenes instanceof Error) && !!oncoKbAnnotatedGenes[copyNumberData[0].entrezGeneId];

            // oncoKbData may exist but it might be an instance of Error, in that case we flag the status as error
            if (oncoKbData && oncoKbData.result instanceof Error) {
                oncoKbStatus = "error";
            }
            else if (oncoKbGeneExist) {
                // actually, oncoKbData.result shouldn't be an instance of Error in this case (we already check it above),
                // but we need to check it again in order to avoid TS errors/warnings
                if (oncoKbData &&
                    oncoKbData.result &&
                    !(oncoKbData.result instanceof Error) &&
                    oncoKbData.status === "complete")
                {
                    oncoKbIndicator = AnnotationColumnFormatter.getIndicatorData(copyNumberData, oncoKbData.result, studyIdToStudy);
                }
                oncoKbStatus = oncoKbData ? oncoKbData.status : "pending";
            }


            value = {
                hugoGeneSymbol,
                oncoKbStatus,
                oncoKbIndicator,
                oncoKbGeneExist,
                civicEntry: civicGenes && civicGenes.result && civicVariants && civicVariants.result?
                    AnnotationColumnFormatter.getCivicEntry(copyNumberData, civicGenes.result, civicVariants.result) : undefined,
                civicStatus: civicGenes && civicGenes.status && civicVariants && civicVariants.status ?
                        AnnotationColumnFormatter.getCivicStatus(civicGenes.status, civicVariants.status) : "pending",
                hasCivicVariants: civicGenes && civicGenes.result && civicVariants && civicVariants.result ?
                    AnnotationColumnFormatter.hasCivicVariants(copyNumberData, civicGenes.result, civicVariants.result) : true,
                pharmacoDBView: cnaPharmacoDBViewListDW && cnaPharmacoDBViewListDW.result && uniqueSampleKeyToOncoTreeCode ? 
                    AnnotationColumnFormatter.getPharamacoDBView(copyNumberData, uniqueSampleKeyToOncoTreeCode, cnaPharmacoDBViewListDW.result) : undefined,
                pharmacoDBStatus: cnaPharmacoDBViewListDW && cnaPharmacoDBViewListDW.status ? cnaPharmacoDBViewListDW.status : "pending",
                myCancerGenomeLinks: [],
                hotspotStatus: "complete",
                isHotspot: false,
                is3dHotspot: false
            };
        }
        else {
            value = DefaultAnnotationColumnFormatter.DEFAULT_ANNOTATION_DATA;
        }

        return value;
    }

  /**
    * Returns an IPharmacoDBView if the oncoTreeCode, Gene and CNA Status match
    * Otherwise it returns an empty object.
    * Todo: Need to match against all 3 parameters
    */
    public static getPharamacoDBView(copyNumberData:DiscreteCopyNumberData[], 
        uniqueSampleKeyToOncoTreeCode:{[uniqueSampleKey: string]: string},
        cnaPharmacoDBViewListDW : IPharmacoDBViewList): IPharmacoDBView | null
    {
        
        let pharmacoDBView = null;
        let geneSymbol: string = copyNumberData[0].gene.hugoGeneSymbol;
        let alteration:number = copyNumberData[0].alteration;
        let status:string = '';
        if(alteration != 0) {
            switch (alteration) {
                case -2:
                    status ='DEEPDEL';
                break;
                case -1:
                    status ='SHALLOWDEL';
                break;
                case 1:
                    status ='GAIN';
                break;
                case 2:
                    status ='AMP';
                break;
                default:
                    status='';
                break;
            } 
        }
        let otc:string = '';
        if(uniqueSampleKeyToOncoTreeCode && uniqueSampleKeyToOncoTreeCode[copyNumberData[0].uniqueSampleKey])
            otc = uniqueSampleKeyToOncoTreeCode[copyNumberData[0].uniqueSampleKey];
        let key:string = geneSymbol + otc + status;
        if (cnaPharmacoDBViewListDW && cnaPharmacoDBViewListDW[key])
        {
            pharmacoDBView = cnaPharmacoDBViewListDW[key] ;
        }
        return pharmacoDBView;
    }

   /**
    * Returns an ICivicEntry if the civicGenes and civicVariants have information about the gene and the mutation (variant) specified. Otherwise it returns
    * an empty object.
    */
    public static getCivicEntry(copyNumberData:DiscreteCopyNumberData[], civicGenes:ICivicGene, 
                                civicVariants:ICivicVariant): ICivicEntry | null
    {
        let civicEntry = null;
        let geneSymbol: string = copyNumberData[0].gene.hugoGeneSymbol;
        let geneVariants:{[name: string]: ICivicVariantData} = getCivicCNAVariants(copyNumberData, geneSymbol, civicVariants);
        let geneEntry: ICivicGeneData = civicGenes[geneSymbol];
        //Only return data for genes with variants or it has a description provided by the Civic API
        if (!_.isEmpty(geneVariants) || geneEntry && geneEntry.description !== "") {
            civicEntry = buildCivicEntry(geneEntry, geneVariants);
        }

        return civicEntry;
    }
    
    public static getCivicStatus(civicGenesStatus:"pending" | "error" | "complete", civicVariantsStatus:"pending" | "error" | "complete"): "pending" | "error" | "complete"
    {
    if (civicGenesStatus === "error" || civicVariantsStatus === "error") {
        return "error";
    }
    if (civicGenesStatus === "complete" && civicVariantsStatus === "complete") {
        return "complete";
    }
    
    return "pending";
    }

    public static hasCivicVariants (copyNumberData:DiscreteCopyNumberData[], civicGenes:ICivicGene, civicVariants:ICivicVariant): boolean
    {
        let geneSymbol: string = copyNumberData[0].gene.hugoGeneSymbol;
        let geneVariants:{[name: string]: ICivicVariantData} = getCivicCNAVariants(copyNumberData, geneSymbol, civicVariants);
        let geneEntry: ICivicGeneData = civicGenes[geneSymbol];

        if (geneEntry && _.isEmpty(geneVariants)) {
            return false;
        }

        return true;
    }

    public static getIndicatorData(copyNumberData:DiscreteCopyNumberData[], oncoKbData:IOncoKbData, studyIdToStudy?: {[studyId:string]:CancerStudy}): IndicatorQueryResp|undefined
    {
        if (oncoKbData.uniqueSampleKeyToTumorType === null || oncoKbData.indicatorMap === null) {
            return undefined;
        }

        const id = generateQueryVariantId(copyNumberData[0].gene.entrezGeneId,
            oncoKbData.uniqueSampleKeyToTumorType[copyNumberData[0].uniqueSampleKey],
            getAlterationString(copyNumberData[0].alteration));

        let indicator = oncoKbData.indicatorMap[id];
        if (indicator.query.tumorType === null && studyIdToStudy) {
            const studyMetaData = studyIdToStudy[copyNumberData[0].studyId];
            if (studyMetaData.cancerTypeId !== "mixed") {           
                indicator.query.tumorType = studyMetaData.cancerType.name;
            }
        }
        return indicator;
    }

    public static getEvidenceQuery(copyNumberData:DiscreteCopyNumberData[], oncoKbData:IOncoKbData): Query|undefined
    {
        // return null in case sampleToTumorMap is null
        return oncoKbData.uniqueSampleKeyToTumorType ? generateQueryVariant(copyNumberData[0].gene.entrezGeneId,
            oncoKbData.uniqueSampleKeyToTumorType[copyNumberData[0].uniqueSampleKey],
            getAlterationString(copyNumberData[0].alteration)
        ) : undefined;
    }

    public static sortValue(data:DiscreteCopyNumberData[],
                            oncoKbAnnotatedGenes:{[entrezGeneId:number]:boolean}|Error,
                            oncoKbData?: IOncoKbDataWrapper,
                            civicGenes?: ICivicGeneDataWrapper,
                            civicVariants?: ICivicVariantDataWrapper,
                            uniqueSampleKeyToOncoTreeCode?:{[uniqueSampleKey: string]: string},
                            cnaPharmacoDBViewListDW?:IPharmacoDBViewListDataWrapper):number[] {
        const annotationData:IAnnotation = AnnotationColumnFormatter.getData(data, oncoKbAnnotatedGenes, oncoKbData, civicGenes, civicVariants, uniqueSampleKeyToOncoTreeCode, cnaPharmacoDBViewListDW);

        return _.flatten([OncoKB.sortValue(annotationData.oncoKbIndicator),
                         Civic.sortValue(annotationData.civicEntry),
                        PharmacoDB.sortValue(annotationData.pharmacoDBView)]);
    }

    public static renderFunction(data:DiscreteCopyNumberData[], columnProps:IAnnotationColumnProps)
    {
        const annotation:IAnnotation = AnnotationColumnFormatter.getData(data, columnProps.oncoKbAnnotatedGenes, columnProps.oncoKbData, columnProps.civicGenes, columnProps.civicVariants,  columnProps.uniqueSampleKeyToOncoTreeCode, columnProps.cnaPharmacoDBViewListDW, columnProps.studyIdToStudy);

        let evidenceQuery:Query|undefined;

        if (columnProps.oncoKbData &&
            columnProps.oncoKbData.result &&
            !(columnProps.oncoKbData.result instanceof Error))
        {
            evidenceQuery = this.getEvidenceQuery(data, columnProps.oncoKbData.result);
        }

        return DefaultAnnotationColumnFormatter.mainContent(annotation,
            columnProps,
            columnProps.oncoKbEvidenceCache,
            evidenceQuery,
            columnProps.pubMedCache);
    }
}
