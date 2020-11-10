import { isPresent, trimObject } from "grapher/utils/Util"
import {
    queryParamsToStr,
    strToQueryParams,
    QueryParams,
} from "utils/client/url"
import { action, observable, computed } from "mobx"
import { SubNavId } from "site/server/views/SiteSubnavigation"
import { ObservableUrl } from "grapher/utils/UrlBinder"
import {
    ExplorerControlType,
    ExplorerControlOption,
    ExplorerControlTypeRegex,
    DefaultNewExplorerSlug,
} from "./ExplorerConstants"
import { CoreTable } from "coreTable/CoreTable"
import { CoreMatrix } from "coreTable/CoreTableConstants"
import { ColumnTypeNames } from "coreTable/CoreColumnDef"
import {
    trimMatrix,
    detectDelimiter,
    parseDelimited,
    isCellEmpty,
} from "coreTable/CoreTableUtils"
import { getRequiredChartIds } from "./ExplorerUtils"

const CHART_ID_SYMBOL = "chartId"

interface Choice {
    title: string
    options: ExplorerControlOption[]
    value: string
    type: ExplorerControlType
}

export const explorerFileSuffix = ".explorer.tsv"

export enum CheckboxOption {
    true = "true",
    false = "false",
}

const nodeDelimiter = "\n"
const cellDelimiter = "\t"
const edgeDelimiter = "\t"

export enum ExplorerKeywordList {
    switcher = "switcher",
    table = "table",
    columns = "columns",
    isPublished = "isPublished",
    title = "title",
    subNavId = "subNavId",
    subNavCurrentId = "subNavCurrentId",
    hideAlertBanner = "hideAlertBanner",
    thumbnail = "thumbnail",
    subtitle = "subtitle",
    defaultView = "defaultView",
    wpBlockId = "wpBlockId",
    googleSheet = "googleSheet",
}

enum CellTypes {
    keyword = "keyword",
    wip = "wip", // Not quite a comment, but not a valid typ. A "work in progress" cell.
    isPublished = "isPublished",
    hideAlertBanner = "hideAlertBanner",
    title = "title",
    subtitle = "subtitle",
    googleSheet = "googleSheet",
    defaultView = "defaultView",
    subNavId = "subNavId",
    subNavCurrentId = "subNavCurrentId",
}

interface CellTypeDefinition {
    options: string[]
    cssClass: string
    description: string
}

const BooleanCellTypeDefinition: CellTypeDefinition = {
    options: Object.values(CheckboxOption),
    cssClass: "BooleanCellType",
    description: "Boolean",
}

const StringCellTypeDefinition: CellTypeDefinition = {
    options: [],
    cssClass: "StringCellType",
    description: "",
}

const UrlCellTypeDefinition: CellTypeDefinition = {
    ...StringCellTypeDefinition,
    cssClass: "UrlCellType",
}

const CellTypeDefinitions: { [key in CellTypes]: CellTypeDefinition } = {
    keyword: {
        options: Object.values(ExplorerKeywordList),
        cssClass: "KeywordCellType",
        description: "Keyword",
    },
    wip: { options: [], cssClass: "WipCellType", description: "A comment" },
    isPublished: {
        ...BooleanCellTypeDefinition,
        description: "Set to true to make this Explorer public.",
    },
    hideAlertBanner: {
        ...BooleanCellTypeDefinition,
        description: "Set to true to hide the Covid alert banner.",
    },
    title: {
        ...StringCellTypeDefinition,
        description:
            "The title will appear in the top left corner of the page.",
    },
    subtitle: {
        ...StringCellTypeDefinition,
        description: "The subtitle will appear under the title.",
    },
    googleSheet: {
        ...UrlCellTypeDefinition,
        description:
            "Create a Google Sheet, share it with the OWID Group, then put the link here.",
    },
    defaultView: {
        ...UrlCellTypeDefinition,
        description:
            "Use the Explorer, then copy the part of the url starting with ? here.",
    },
    subNavId: {
        options: Object.values(SubNavId),
        cssClass: "EnumCellType",
        description: "A subnav to show, if any.",
    },
    subNavCurrentId: {
        options: [], // todo: get options in here
        cssClass: "EnumCellType",
        description: "The current page in the subnav.",
    },
}

interface BlockLocation {
    start: number
    end: number
    length: number
}

export interface TableDef {
    url?: string
    columnDefinitions?: string
    inlineData?: string
}

export interface SerializedExplorerProgram {
    slug: string
    program: string
    lastModifiedTime?: number
}

const ErrorCellTypeClass = "ErrorCellType"

type CellCoordinate = number // An integer >= 0

interface CellLink {
    row: CellCoordinate
    column: CellCoordinate
}

class ExplorerProgramCell {
    private row: CellCoordinate
    private column: CellCoordinate
    private program: ExplorerProgram
    constructor(
        program: ExplorerProgram,
        row: CellCoordinate,
        column: CellCoordinate
    ) {
        this.row = row
        this.column = column
        this.program = program
    }

    get comment() {
        const { cellTypeDefinition, value } = this
        if (value === undefined || value === "") return undefined

        const { options } = cellTypeDefinition
        const optionsLine = options.length
            ? `Options: ${options.join(", ")}`
            : undefined
        return [this.cellTypeDefinition.description, optionsLine]
            .filter(isPresent)
            .join("\n")
    }

    private get words() {
        return this.line !== undefined
            ? this.line.split(this.program.cellDelimiter)
            : []
    }

    private get lineKeyword() {
        return this.words[0]
    }

    private get value() {
        return this.words[this.column]
    }

    private get line() {
        return this.program.lines[this.row]
    }

    get isValid() {
        if (!this.line) return true

        const { options } = this
        if (!options.length) return true
        const value = this.value
        if (value === undefined || value === "") return true
        return options.includes(value)
    }

    private get cellTypeName() {
        if (this.column === 0) return CellTypes.keyword
        if (this.column === 1) {
            const keyword = this.lineKeyword as CellTypes
            if (CellTypeDefinitions[keyword]) return keyword
        }
        return CellTypes.wip
    }

    private get cellTypeDefinition() {
        return CellTypeDefinitions[this.cellTypeName]
    }

    get cssClasses() {
        if (!this.isValid) return [ErrorCellTypeClass]

        return [this.cellTypeDefinition.cssClass]
    }

    private get secondaryNotations() {
        return {
            fontColor: "black",
            fontSize: "12",
            fontWeight: 400,
            textDecoration: "underline",
            backgroundColor: "white",
            textTransform: "red",
            rightEmoji: "red",
            leftEmoji: "red",
            backgroundEmoji: "icon",
        }
    }

    get options() {
        return this.cellTypeDefinition.options ?? []
    }

    private get errors() {
        return []
    }

    private get examples() {
        return []
    }

    private get suggestions() {
        return []
    }

    private get definitionLinks(): CellLink[] {
        return []
    }

    private get implementationLinks(): CellLink[] {
        return []
    }
}

export class ExplorerProgram {
    constructor(
        slug: string,
        tsv: string,
        queryString = "",
        lastModifiedTime?: number
    ) {
        this.lines = tsv.replace(/\r/g, "").split(this.nodeDelimiter)
        this.slug = slug
        queryString = (queryString ? queryString : this.defaultView) ?? ""
        this.decisionMatrix = new DecisionMatrix(
            this.decisionMatrixCode || "",
            queryString
        )
        this.queryString = queryString
        this.lastModifiedTime = lastModifiedTime
    }

    lastModifiedTime?: number
    slug: string
    queryString: string
    decisionMatrix: DecisionMatrix

    toJson(): SerializedExplorerProgram {
        return {
            program: this.toString(),
            slug: this.slug,
            lastModifiedTime: this.lastModifiedTime,
        }
    }

    get isNewFile() {
        return this.slug === DefaultNewExplorerSlug
    }

    static fromJson(json: SerializedExplorerProgram) {
        return new ExplorerProgram(
            json.slug,
            json.program,
            undefined,
            json.lastModifiedTime
        )
    }

    get filename() {
        return this.slug + explorerFileSuffix
    }

    static fullPath(slug: string) {
        return `explorers/${slug}${explorerFileSuffix}`
    }

    get fullPath() {
        return ExplorerProgram.fullPath(this.slug)
    }

    private nodeDelimiter = nodeDelimiter
    cellDelimiter = cellDelimiter
    private edgeDelimiter = edgeDelimiter
    lines: string[]

    private getLineValue(keyword: string) {
        const line = this.lines.find((line) =>
            line.startsWith(keyword + this.cellDelimiter)
        )
        return line ? line.split(this.cellDelimiter)[1] : undefined
    }

    getKeywordIndex(key: ExplorerKeywordList) {
        return this.lines.findIndex(
            (line) => line.startsWith(key + this.cellDelimiter) || line === key
        )
    }

    getKeywordIndexes(words: string[]) {
        const key = words.join(this.cellDelimiter)
        return this.lines
            .map((line, index) =>
                line.startsWith(key + this.cellDelimiter) || line === key
                    ? index
                    : null
            )
            .filter(isPresent)
    }

    getCell(row: number, col: number) {
        return new ExplorerProgramCell(this, row, col)
    }

    private setLineValue(key: ExplorerKeywordList, value: string | undefined) {
        const index = this.getKeywordIndex(key)
        const newLine = `${key}${this.cellDelimiter}${value}`
        if (index === -1 && value !== undefined) this.lines.push(newLine)
        else if (value === undefined) this.lines = this.lines.splice(index, 1)
        else this.lines[index] = newLine
    }

    private getBlock(keywordIndex: number) {
        const location = this.getBlockLocation(keywordIndex)
        return this.lines
            .slice(location.start, location.end)
            .map((line) => line.substr(1))
            .join(this.nodeDelimiter)
    }

    get requiredChartIds() {
        return getRequiredChartIds(this.decisionMatrixCode ?? "")
    }

    static fromMatrix(slug: string, matrix: CoreMatrix) {
        const str = matrix
            .map((row) => row.join(cellDelimiter))
            .join(nodeDelimiter)
        return new ExplorerProgram(slug, str)
    }

    toArrays() {
        return this.lines.map((line) => line.split(this.cellDelimiter))
    }

    // The max number of columns in any row when you view a program as a spreadsheet
    get width() {
        return Math.max(...this.toArrays().map((arr) => arr.length))
    }

    toString() {
        return this.prettify()
    }

    private prettify() {
        return trimMatrix(this.toArrays())
            .map((line) => line.join(this.cellDelimiter))
            .join(this.nodeDelimiter)
    }

    private getBlockLocation(blockStartLine: number): BlockLocation {
        const blockStart = blockStartLine + 1
        let length = this.lines
            .slice(blockStart)
            .findIndex((line) => line && !line.startsWith(this.edgeDelimiter))
        if (length === -1) length = this.lines.slice(blockStart).length
        return { start: blockStart, end: blockStart + length, length }
    }

    private setBlock(keyword: ExplorerKeywordList, value: string | undefined) {
        if (!value) return this.deleteBlock(keyword)

        const keywordIndex = this.getKeywordIndex(keyword)
        if (keywordIndex === -1) return this.appendBlock(keyword, value)
        const location = this.getBlockLocation(keywordIndex)

        this.lines = this.lines.splice(
            location.start,
            location.length,
            keyword,
            ...value
                .split(this.nodeDelimiter)
                .map((line) => this.edgeDelimiter + line)
        )
    }

    private appendBlock(key: string, value: string) {
        this.lines.push(key)
        value
            .split(this.nodeDelimiter)
            .forEach((line) => this.lines.push(this.edgeDelimiter + line))
    }

    private deleteBlock(keyword: ExplorerKeywordList) {
        const keywordIndex = this.getKeywordIndex(keyword)
        if (keywordIndex === -1) return
        const location = this.getBlockLocation(keywordIndex)
        this.lines = this.lines.splice(location.start, location.length)
    }

    get title() {
        return this.getLineValue(ExplorerKeywordList.title)
    }

    get subNavId(): SubNavId | undefined {
        return this.getLineValue(ExplorerKeywordList.subNavId) as SubNavId
    }

    get googleSheet() {
        return this.getLineValue(ExplorerKeywordList.googleSheet)
    }

    get hideAlertBanner() {
        return (
            this.getLineValue(ExplorerKeywordList.hideAlertBanner) ===
            CheckboxOption.true
        )
    }

    get subNavCurrentId() {
        return this.getLineValue(ExplorerKeywordList.subNavCurrentId)
    }

    get thumbnail() {
        return this.getLineValue(ExplorerKeywordList.thumbnail)
    }

    get subtitle() {
        return this.getLineValue(ExplorerKeywordList.subtitle)
    }

    get defaultView() {
        // Todo: to help authors, at least do a console log if defaultView is malformed (has invalid param names, for example).
        return this.getLineValue(ExplorerKeywordList.defaultView)
    }

    get isPublished() {
        return (
            this.getLineValue(ExplorerKeywordList.isPublished) ===
            CheckboxOption.true
        )
    }

    set isPublished(value: boolean) {
        this.setLineValue(
            ExplorerKeywordList.isPublished,
            value ? CheckboxOption.true : CheckboxOption.false
        )
    }

    get wpBlockId() {
        const blockIdString = this.getLineValue(ExplorerKeywordList.wpBlockId)
        return blockIdString ? parseInt(blockIdString, 10) : undefined
    }

    get decisionMatrixCode() {
        const keywordIndex = this.getKeywordIndex(ExplorerKeywordList.switcher)
        if (keywordIndex === -1) return undefined
        return this.getBlock(keywordIndex)
    }

    getTableDef(tableSlug: string): TableDef | undefined {
        const matchingTableIndex = this.getKeywordIndexes([
            ExplorerKeywordList.table,
            tableSlug,
        ])[0]
        if (matchingTableIndex === undefined) return undefined

        const matchingColumnsIndex = this.getKeywordIndexes([
            ExplorerKeywordList.columns,
            tableSlug,
        ])[0]
        return {
            url: this.lines[matchingTableIndex].split(this.cellDelimiter)[2],
            columnDefinitions: matchingColumnsIndex
                ? this.getBlock(matchingColumnsIndex)
                : undefined,
            inlineData: this.getBlock(matchingTableIndex),
        }
    }
}

// todo: cleanup
const makeControlTypesMap = (delimited: string) => {
    const headerLine = delimited.split("\n")[0]
    const map = new Map<ChoiceName, ExplorerControlType>()
    headerLine
        .split(detectDelimiter(headerLine))
        .filter((name) => ExplorerControlTypeRegex.test(name))
        .forEach((choiceName) => {
            const words = choiceName.split(" ")
            const type = words.pop() as ExplorerControlType
            map.set(words.join(" "), type)
        })
    return map
}

// todo: cleanup
// This strips the "Dropdown" or "Checkbox" from "SomeChoice Dropdown" or "SomeChoice Checkbox"
const removeChoiceControlTypeInfo = (str: string) => {
    const lines = str.split("\n")
    const headerLine = lines[0]
    const delimiter = detectDelimiter(headerLine)
    lines[0] = headerLine
        .split(delimiter)
        .map((cell) => cell.replace(ExplorerControlTypeRegex, ""))
        .join(delimiter)
    return lines.join("\n")
}

type ChoiceName = string
type ChoiceValue = string

// A "query" here is just a map of choice names and values. Maps nicely to a query string.
interface DecisionMatrixQuery {
    [choiceName: string]: ChoiceValue
}

interface ChoiceMap {
    [choiceName: string]: ChoiceValue[]
}

// Takes the author's program and the user's current settings and returns an object for
// allow the user to navigate amongst charts.
export class DecisionMatrix implements ObservableUrl {
    private table: CoreTable
    @observable private _settings: DecisionMatrixQuery = {}
    constructor(delimited: string, queryString: string = "") {
        this.choiceControlTypes = makeControlTypesMap(delimited)
        delimited = removeChoiceControlTypeInfo(delimited)
        this.table = new CoreTable(parseDelimited(delimited), [
            { slug: CHART_ID_SYMBOL, type: ColumnTypeNames.Integer },
        ])
        this.setValuesFromQueryString(queryString)
    }

    allOptionsAsQueryStrings() {
        return this.table.rows.map((row) => {
            const params: QueryParams = {}
            this.choiceNames.forEach((name) => {
                params[name] = row[name]
            })
            return queryParamsToStr(params)
        })
    }

    private choiceControlTypes: Map<ChoiceName, ExplorerControlType>

    toObject(): DecisionMatrixQuery {
        return { ...this._settings }
    }

    @computed get params(): QueryParams {
        return this.toObject()
    }

    toConstrainedOptions() {
        const settings = this.toObject()
        this.choiceNames.forEach((choiceName) => {
            if (!this.isOptionAvailable(choiceName, settings[choiceName]))
                settings[choiceName] = this.firstAvailableOptionForChoice(
                    choiceName
                )!
        })
        return settings
    }

    @action.bound setValue(choiceName: ChoiceName, value: ChoiceValue) {
        if (value === "") delete this._settings[choiceName]
        else this._settings[choiceName] = value
    }

    @action.bound setValuesFromQueryString(queryString: string) {
        const queryParams = strToQueryParams(decodeURIComponent(queryString))
        this.choiceNames.forEach((choiceName) => {
            if (queryParams[choiceName] === undefined)
                this.setValue(
                    choiceName,
                    this.firstAvailableOptionForChoice(choiceName)!
                )
            else this.setValue(choiceName, queryParams[choiceName]!)
        })
    }

    @computed private get choiceNames(): ChoiceName[] {
        return Array.from(this.choiceControlTypes.keys())
    }

    @computed private get allChoiceOptions(): ChoiceMap {
        const choiceMap: ChoiceMap = {}
        this.choiceNames.forEach((choiceName) => {
            choiceMap[choiceName] = this.table
                .get(choiceName)
                .uniqValues.filter((cell) => !isCellEmpty(cell)) as string[]
        })
        return choiceMap
    }

    private firstAvailableOptionForChoice(
        choiceName: ChoiceName
    ): ChoiceValue | undefined {
        return this.allChoiceOptions[choiceName].find((option) =>
            this.isOptionAvailable(choiceName, option)
        )
    }

    isOptionAvailable(choiceName: ChoiceName, option: ChoiceValue) {
        const query: DecisionMatrixQuery = {}
        this.choiceNames
            .slice(0, this.choiceNames.indexOf(choiceName))
            .forEach((name) => {
                query[name] = this._settings[name]
            })
        query[choiceName] = option
        return this.rowsWith(query, choiceName).length > 0
    }

    private rowsWith(query: DecisionMatrixQuery, choiceName?: ChoiceName) {
        // We allow other options to be blank.
        const modifiedQuery: any = {}
        Object.keys(trimObject(query)).forEach((queryColumn) => {
            if (queryColumn !== choiceName)
                // Blanks are fine if we are not talking about the column of interest
                modifiedQuery[queryColumn] = [query[queryColumn], ""]
            else modifiedQuery[queryColumn] = query[queryColumn]
        })
        return this.table.findRows(modifiedQuery)
    }

    @computed private get firstMatch() {
        return this.rowsWith(this.toConstrainedOptions())[0]
    }

    @computed get selectedRowIndex() {
        return this.firstMatch === undefined
            ? 0
            : this.table.indexOf(this.firstMatch)
    }

    @computed get selectedRow() {
        return this.table.rowsAt([this.selectedRowIndex])[0]
    }

    private toControlOption(
        choiceName: ChoiceName,
        optionName: string,
        value: ChoiceValue
    ): ExplorerControlOption {
        return {
            label: optionName,
            checked: value === optionName,
            value: optionName,
            available: this.isOptionAvailable(choiceName, optionName),
        }
    }

    @computed get choicesWithAvailability(): Choice[] {
        const constrainedOptions = this.toConstrainedOptions()
        return this.choiceNames.map((title) => {
            const value = constrainedOptions[title]
            const options = this.allChoiceOptions[title].map((optionName) =>
                this.toControlOption(title, optionName, value)
            )
            const type = this.choiceControlTypes.get(title)!

            return {
                title,
                type,
                value,
                options:
                    type === ExplorerControlType.Checkbox
                        ? makeCheckBoxOptions(options, title)
                        : options,
            }
        })
    }

    toString() {
        return queryParamsToStr(this._settings)
    }
}

const makeCheckBoxOptions = (
    options: ExplorerControlOption[],
    choiceName: string
) => {
    const checked = options.find(
        (option) =>
            option.checked === true && option.label === CheckboxOption.true
    )
    return [
        {
            label: choiceName,
            checked,
            value: CheckboxOption.true,
            available: options.length > 1,
        },
    ] as ExplorerControlOption[]
}
