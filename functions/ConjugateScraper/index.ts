import { AzureFunction, Context, HttpRequest } from "@azure/functions";
const fetch = require("node-fetch");
const cheerio = require("cheerio");
const { Parser } = require("json2csv");

const baseUrl = "https://www.spanishdict.com/conjugate/";

const httpTrigger: AzureFunction = async function(
  context: Context,
  req: HttpRequest
): Promise<void> {
  const verbs = req.query.verbs;
  const mood = req.query.mood && uppercaseFirstCharacter(req.query.mood);
  const includeVosotros =
    req.query.includeVosotros &&
    uppercaseFirstCharacter(req.query.includeVosotros);

  if (!verbs || !mood) {
    context.res = {
      status: 400,
      body: "You must supply the 'verb' and the 'mood' parameters"
    };
  }

  // generate the data
  const verbData = [];
  const verbNames = verbs.split(",");
  verbNames.forEach(async verb => {
    verbData.push(await getVerbData(verb, mood, includeVosotros));
  })
  const csv = generateCsv(verbData);
  context.res = {
    body: csv
  };
};

const getVerbData = async (verb, mood, includeVosotros) => {
  const verbPage = `${baseUrl}${verb}`;
  const response = await fetch(verbPage);
  const html = await response.text();
  const $ = cheerio.load(html);
  const conjugationTable = getMoodConjugationTable($, mood);
  const conjugationData = extractValuesFromTable(
    $,
    conjugationTable,
    includeVosotros
  );
  return generateFlashcardData(verb, mood, conjugationData);
};

const extractValuesFromTable = (
  $,
  table: any,
  includeVosotros: boolean = false
): Conjugation[] => {
  const rows = table.children("tbody").children("tr");
  let tenses: string[] = [];
  let conjugations: Conjugation[] = [];
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const columns = $(row).children();
    if (index === 0) {
      tenses = getTenses($, columns);
    } else {
      const conjugationsFromRow = getConjugations(
        $,
        columns,
        tenses,
        includeVosotros
      );
      conjugations = conjugations.concat(conjugationsFromRow);
    }
  }
  return conjugations;
};

const getTenses = ($, columns): string[] => {
  const tenses = [];
  for (let index = 0; index < columns.length; index++) {
    if (index > 0) {
      // the first heading is empty
      const tense = $(columns[index]).text();
      tenses.push(tense.toLowerCase());
    }
  }
  return tenses;
};

const getConjugations = (
  $,
  columns,
  tenses,
  includeVosotros: boolean = false
): Conjugation[] => {
  let conjugations: Conjugation[] = [];
  let pronoun: string;
  for (let index = 0; index < columns.length; index++) {
    const column = $(columns[index]);
    if (index === 0) {
      // the first heading is the pronoun
      pronoun = $(column).text();
    } else if (!includeVosotros && pronoun !== "vosotros") {
      if (!includeVosotros && pronoun === "vosotros") {
        continue;
      }
      const word = $(column).text();
      conjugations.push({
        word,
        pronoun,
        tense: tenses[index - 1]
      });
    }
  }
  return conjugations;
};

const getMoodConjugationTable = ($: any, mood: string) => {
  const tableWrapper = $(`.vtable-header:contains('${mood}')`)
    .first()
    .next();
  return tableWrapper.children("table").first();
};

const uppercaseFirstCharacter = string => {
  return string.charAt(0).toUpperCase() + string.slice(1);
};

const generateFlashcardData = (
  verb: string,
  mood: string,
  conjugations: Conjugation[]
): Flashcard[] => {
  const csvData = conjugations.map(conjugation => {
    return {
      value: conjugation.word,
      definition: generateDefinition(verb, mood, conjugation)
    };
  });
  return csvData;
};

const generateCsv = (flashCardData: Flashcard[]) => {
  const fields = ["value", "definition"];
  const opts = { fields };
  const parser = new Parser(opts);
  const csv = parser.parse(flashCardData);
  return csv;
};

const generateDefinition = (
  verb: string,
  mood: string,
  conjugation: Conjugation
): string => {
  return `'${verb}' en ${spanishTenseHash[conjugation.tense]} para '${
    conjugation.pronoun
  }'`;
};

const spanishTenseHash = {
  present: "tiempo presente",
  preterite: "tiempo pasado perfecto",
  imperfect: "tiempo pasado imperfecto",
  conditional: "tiempo condicional futuro",
  future: "tiempo futuro"
};

interface Conjugation {
  word: string;
  pronoun: string;
  tense: string;
}

interface Flashcard {
  value: string;
  definition: string;
}

export default httpTrigger;
