const fs = require("fs-extra");
const cheerio = require("cheerio");

const FILE_TO_TEST = "./absence/index.htm";
async function testReading() {
  try {
    // Lecture directe du buffer en UTF-8
    const content = await fs.readFile(FILE_TO_TEST, "utf-8");

    const $ = cheerio.load(content, { decodeEntities: false });

    // Extraction du texte pour vérification
    let sampleText = "";
    $("p, td").each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 30) {
        sampleText += text + "\n\n";
      }
    });

    console.log("--- TEST DE LECTURE UTF-8 ---");
    console.log(sampleText);
    console.log("-----------------------------");
  } catch (err) {
    console.error("Erreur de lecture :", err);
  }
}

testReading();