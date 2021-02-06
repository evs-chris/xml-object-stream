export default function InitXMLObjectStream(config?: Config): XMLObjectStream;

interface Config {
  /**
   * Whether to enable strict parsing in the underlying sax parser.
   * @default true
   */
  strict?: boolean;

  /**
   * Whether to use a case-insensitive match when looking for elements. Non-strict will enable this by default.
   * @default false
   */
  icase?: boolean;

  /**
   * Whether to return a JS object tree for matches that has attributes and children set as keys. Duplicate keys will result in an array of values, and children with no further children will have their text content as their value. If children don't only contain text, the text is available as the `text` property.
   * @default false
   */
  pojo?: boolean;

  /**
   * The chunk size to use when processing the xml. If callbacks are used, this affects how often the parser will yield computation control to allow the callbacks to process.
   * @default 8194
   */
  chunkSize?: number;
}

/** Any old object that says it can pipe to a writeable stream. */
interface Pipeable {
  pipe(stream: NodeJS.WritableStream): void;
}

interface Done {
  onEnd(callback: () => void): void;
}

/**
 * Parses the given xml looking for nodes that match the given pattern, collecting them into an array to be returned once the xml has been fully parsed.
 * @param xml the xml to process
 * @param pattern the xpath-like query used to match nodes
 */
function XMLObjectStream(xml: string|Pipeable, pattern: string): Promise<any[]>;

/**
 * Parses the given xml looking for nodes that match the given pattern. As each node matches, the callback will be called with the match.
 * @param xml the xml to process
 * @param pattern the xpath-like query used to match nodes
 * @param callback the callback function to be called with matches
 */
function XMLObjectStream(xml: string|Pipeable, pattern: string, callback: (match: any) => void): Done;

/**
 * Parses the given xml looking for nodes that match the given pattern. As each node matches, the callback will be called with the match, and processing will be suspended until the callback calls resume.
 * @param xml the xml to process
 * @param pattern the xpath-like query used to match nodes
 * @param callback the callback function to be called with matches and a resumption function
 */
function XMLObjectStream(xml: string|Pipeable, pattern: string, callback: (match: any, resume: () => void) => Done): void;
