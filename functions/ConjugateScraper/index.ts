import { AzureFunction, Context, HttpRequest } from "@azure/functions"
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const baseUrl = "https://www.spanishdict.com/conjugate/";

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    const verb = (req.query.verb);
    const mood = (uppercaseFirstCharacter(req.query.mood));

    if (!verb || !mood) {
        context.res = {
            status: 400,
            body: "You must supply the 'verb' and the 'mood' parameters"
        };
    }

    const verbPage = `${baseUrl}${verb}`;
    const response = await fetch(verbPage);
    const html = await response.text();
    const $ = cheerio.load(html);
    const conjugationTable = getMoodConjugationTable($, mood);
    const conjugationData = extractValuesFromTable($, conjugationTable)
    context.res = {
        body: conjugationData
    };
};

const extractValuesFromTable = ($, table: any): Conjugation[] => {
    const rows = table.children('tbody').children('tr');
    let tenses: string[] = [];
    let conjugations: Conjugation[] = [];
    for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        const columns = $(row).children();
        if (index === 0) {
            tenses = getTenses($, columns)
        } else {
            const conjugationsFromRow = getConjugations($, columns, tenses)
            conjugations = conjugations.concat(conjugationsFromRow);
        }
    }
    return conjugations;
}

const getTenses = ($, columns): string[] => {
    const tenses = [];
    for (let index = 0; index < columns.length; index++) {
        if (index > 0) { // the first heading is empty
            const tense = $(columns[index]).text();
            tenses.push(tense)
        }
    }
    return tenses;
}

const getConjugations = ($, columns, tenses): Conjugation[] => {
    let conjugations: Conjugation[] = [];
    let subject: string;
    for (let index = 0; index < columns.length; index++) {
        const column = $(columns[index]);
        if (index === 0) { // the first heading is the subject
            subject = $(column).text();
        } else {
            const word = $(column).text();
            conjugations.push({
                word,
                tense: tenses[index - 1],
                subject
            });
        }
    }
    return conjugations;
}

const getMoodConjugationTable = ($: any, mood: string) => {
    const tableWrapper = $(`.vtable-header:contains('${mood}')`).first().next();
    return tableWrapper.children('table').first();
}

function uppercaseFirstCharacter(string) 
{
    return string.charAt(0).toUpperCase() + string.slice(1);
}

interface Conjugation {
    word: string;
    tense: string;
    subject: string;
}

export default httpTrigger;
