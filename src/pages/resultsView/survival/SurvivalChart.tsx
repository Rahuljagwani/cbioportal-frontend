import * as React from 'react';
import { observer } from "mobx-react";
import { PatientSurvival } from "../../../shared/model/PatientSurvival";
import { computed, observable } from "mobx";
import { Popover, Table } from 'react-bootstrap';
import styles from "./styles.module.scss";
import { sleep } from "../../../shared/lib/TimeUtils";
import {
    VictoryChart, VictoryContainer, VictoryLine, VictoryTooltip,
    VictoryAxis, VictoryLegend, VictoryLabel, VictoryScatter, VictoryTheme
} from 'victory';
import SvgSaver from 'svgsaver';
import fileDownload from 'react-file-download';
import {
    getEstimates, getMedian, getLineData, getScatterData, getScatterDataWithOpacity, getStats, calculateLogRank,
    getDownloadContent, convertScatterDataToDownloadData
} from "./SurvivalUtil";

export interface ISurvivalChartProps {
    alteredPatientSurvivals: PatientSurvival[];
    unalteredPatientSurvivals: PatientSurvival[];
    totalCasesHeader: string;
    statusCasesHeader: string;
    medianMonthsHeader: string;
    title: string;
    xAxisLabel: string;
    yAxisLabel: string;
    yLabelTooltip: string;
    xLabelWithEventTooltip: string;
    xLabelWithoutEventTooltip: string;
    fileName: string;
}

@observer
export default class SurvivalChart extends React.Component<ISurvivalChartProps, {}> {

    @observable tooltipModel: any;
    private isTooltipHovered: boolean = false;
    private tooltipCounter: number = 0;
    private alteredLegendText = 'Cases with Alteration(s) in Query Gene(s)';
    private unalteredLegendText = 'Cases without Alteration(s) in Query Gene(s)';
    private svgContainer: any;
    private svgsaver = new SvgSaver();

    constructor(props: ISurvivalChartProps) {
        super(props);
        this.tooltipMouseEnter = this.tooltipMouseEnter.bind(this);
        this.tooltipMouseLeave = this.tooltipMouseLeave.bind(this);
        this.downloadSvg = this.downloadSvg.bind(this);
        this.downloadPng = this.downloadPng.bind(this);
        this.downloadData = this.downloadData.bind(this);
    }

    @computed get sortedAlteredPatientSurvivals(): PatientSurvival[] {
        return this.props.alteredPatientSurvivals.sort((a, b) => a.months - b.months);
    }

    @computed get sortedUnalteredPatientSurvivals(): PatientSurvival[] {
        return this.props.unalteredPatientSurvivals.sort((a, b) => a.months - b.months);
    }

    @computed get alteredEstimates(): number[] {
        return getEstimates(this.sortedAlteredPatientSurvivals);
    }

    @computed get unalteredEstimates(): number[] {
        return getEstimates(this.sortedUnalteredPatientSurvivals);
    }

    @computed get logRank(): number {
        return calculateLogRank(this.sortedAlteredPatientSurvivals, this.sortedUnalteredPatientSurvivals);
    }

    private tooltipMouseEnter(): void {
        this.isTooltipHovered = true;
    }

    private tooltipMouseLeave(): void {
        this.isTooltipHovered = false;
        this.tooltipModel = null;
    }

    private downloadSvg() {
        this.svgsaver.asSvg(this.svgContainer.firstChild, this.props.fileName + '.svg');
    }

    private downloadPng() {
        this.svgsaver.asPng(this.svgContainer.firstChild, this.props.fileName + '.png');
    }

    private downloadData() {
        fileDownload(getDownloadContent(getScatterData(this.sortedAlteredPatientSurvivals, this.alteredEstimates),
            getScatterData(this.sortedUnalteredPatientSurvivals, this.unalteredEstimates), this.props.title,
            this.alteredLegendText, this.unalteredLegendText), this.props.fileName + '.txt');
    }

    public render() {

        const events = [{
            target: "data",
            eventHandlers: {
                onMouseOver: () => {
                    return [
                        {
                            target: "data",
                            mutation: () => ({ active: true })
                        },
                        {
                            target: "labels",
                            mutation: (props: any) => {
                                this.tooltipModel = props;
                                this.tooltipCounter++;
                            }
                        }
                    ];
                },
                onMouseOut: () => {
                    return [
                        {
                            target: "data",
                            mutation: () => ({ active: false })
                        },
                        {
                            target: "labels",
                            mutation: async () => {
                                await sleep(100);
                                if (!this.isTooltipHovered && this.tooltipCounter === 1) {
                                    this.tooltipModel = null;
                                }
                                this.tooltipCounter--;
                            }
                        }
                    ];
                }
            }
        }];

        return (

            <div className={styles.SurvivalChart}>
                <VictoryChart containerComponent={<VictoryContainer responsive={false} containerRef={(ref: any) => this.svgContainer = ref} />}
                    height={650} width={1150} padding={{ top: 50, bottom: 50, left: 60, right: 300 }} theme={VictoryTheme.material}>
                    <VictoryLabel x={50} y={15} text={this.props.title} style={{ fontSize: 24, fontFamily: "inherit" }} />
                    <VictoryAxis style={{ ticks: { size: 8 }, tickLabels: { padding: 2 }, axisLabel: { padding: 35 }, grid: { opacity: 0 } }}
                        crossAxis={false} tickCount={11} label={this.props.xAxisLabel} />
                    <VictoryAxis label={this.props.yAxisLabel} dependentAxis={true} tickFormat={(t: any) => `${t}%`} tickCount={11}
                        style={{ ticks: { size: 8 }, tickLabels: { padding: 2 }, axisLabel: { padding: 45 }, grid: { opacity: 0 } }} domain={[0, 100]} crossAxis={false} />
                    <VictoryLine interpolation="stepAfter" data={getLineData(this.sortedAlteredPatientSurvivals, this.alteredEstimates)}
                        style={{ data: { stroke: "red", strokeWidth: 1 } }} />
                    <VictoryLine interpolation="stepAfter" data={getLineData(this.sortedUnalteredPatientSurvivals, this.unalteredEstimates)}
                        style={{ data: { stroke: "blue", strokeWidth: 1 } }} />
                    <VictoryScatter data={getScatterDataWithOpacity(this.sortedAlteredPatientSurvivals, this.alteredEstimates)}
                        symbol="plus" style={{ data: { fill: "red" } }} size={3} />
                    <VictoryScatter data={getScatterDataWithOpacity(this.sortedUnalteredPatientSurvivals, this.unalteredEstimates)}
                        symbol="plus" style={{ data: { fill: "blue" } }} size={3} />
                    <VictoryScatter data={getScatterData(this.sortedAlteredPatientSurvivals, this.alteredEstimates)}
                        symbol="circle" style={{ data: { fill: "red", fillOpacity: (datum: any, active: any) => active ? 0.3 : 0 } }} size={10} events={events} />
                    <VictoryScatter data={getScatterData(this.sortedUnalteredPatientSurvivals, this.unalteredEstimates)}
                        symbol="circle" style={{ data: { fill: "blue", fillOpacity: (datum: any, active: any) => active ? 0.3 : 0 } }} size={10} events={events} />
                    <VictoryLegend x={850} y={40}
                        data={[
                            { name: this.alteredLegendText, symbol: { fill: "red", type: "square" } },
                            { name: this.unalteredLegendText, symbol: { fill: "blue", type: "square" } },
                            { name: `Logrank Test P-Value: ${this.logRank.toPrecision(3)}`, symbol: { opacity: 0 } }]} />
                </VictoryChart>
                {this.tooltipModel &&
                    <Popover arrowOffsetTop={48} positionLeft={this.tooltipModel.x + 15}
                        positionTop={this.tooltipModel.y - 60}
                        onMouseEnter={this.tooltipMouseEnter} onMouseLeave={this.tooltipMouseLeave}>
                        <div className={styles.Tooltip}>
                            Patient ID: <a href={'/case.do#/patient?caseId=' + this.tooltipModel.datum.patientId + '&studyId=' +
                                this.tooltipModel.datum.studyId} target="_blank">{this.tooltipModel.datum.patientId}</a><br />
                            {this.props.yLabelTooltip}: {(this.tooltipModel.datum.y).toFixed(2)}%<br />
                            {this.tooltipModel.datum.status ? this.props.xLabelWithEventTooltip :
                                this.props.xLabelWithoutEventTooltip}
                            : {this.tooltipModel.datum.x.toFixed(2)} months {this.tooltipModel.datum.status ? "" :
                                "(censored)"}
                        </div>

                    </Popover>
                }
                <div className={styles.SVG + ' cbioportal-frontend'}>
                    <a className={`btn btn-default btn-xs`} onClick={this.downloadSvg}>
                        SVG <i className="fa fa-cloud-download" />
                    </a>
                </div>
                <div className={styles.PNG + ' cbioportal-frontend'}>
                    <a className={`btn btn-default btn-xs`} onClick={this.downloadPng}>
                        PNG <i className="fa fa-cloud-download" />
                    </a>
                </div>
                <div className={styles.Data + ' cbioportal-frontend'}>
                    <a className={`btn btn-default btn-xs`} onClick={this.downloadData}>
                        Data <i className="fa fa-cloud-download" />
                    </a>
                </div>
                <div className={styles.SurvivalTable}>
                    <Table bordered condensed striped>
                        <tbody>
                            <tr>
                                <td />
                                <td>{this.props.totalCasesHeader}</td>
                                <td>{this.props.statusCasesHeader}</td>
                                <td>{this.props.medianMonthsHeader}</td>
                            </tr>
                            <tr>
                                <td>{this.alteredLegendText}</td>
                                {
                                    getStats(this.sortedAlteredPatientSurvivals, this.alteredEstimates).map(stat =>
                                        <td><b>{stat}</b></td>)
                                }
                            </tr>
                            <tr>
                                <td>{this.unalteredLegendText}</td>
                                {
                                    getStats(this.sortedUnalteredPatientSurvivals, this.unalteredEstimates).map(stat =>
                                        <td><b>{stat}</b></td>)
                                }
                            </tr>
                        </tbody>
                    </Table>
                </div>
            </div>
        );
    }
}
