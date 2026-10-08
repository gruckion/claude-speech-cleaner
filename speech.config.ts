import { markdownTables, separators } from "./src/replacers/index.ts";

/** Register new replacers here. Table structure must be parsed before punctuation cleanup. */
export const replacers = [markdownTables, separators];
