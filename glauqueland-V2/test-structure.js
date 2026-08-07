const fs = require("fs-extra");
const cheerio = require("cheerio");

// Chemin vers le fichier de test unique
const FILE_TO_TEST = "./absence/index.htm";

async function testStructure() {
  // Déclaration de l'état global de la fonction
  const blocks = [];
  let currentGallery = [];

  /**
   * Fonction utilitaire déclarée à la racine de la fonction englobante :
   * Vide le tampon temporaire d'images pour créer un bloc de galerie dans le tableau principal.
   */
  function flushGallery() {
    if (currentGallery.length > 0) {
      blocks.push({
        type: "gallery",
        count: currentGallery.length,
        images: [...currentGallery],
      });
      currentGallery = []; // Réinitialisation du tampon
    }
  }

  try {
    const content = await fs.readFile(FILE_TO_TEST, "utf-8");
    const $ = cheerio.load(content, { decodeEntities: false });

    // Parcours séquentiel des éléments du DOM dans l'ordre du document
    $("body").find("table, p, div, img").each((_, el) => {
      const $el = $(el);

      // Cas 1 : Traitement des images isolées ou en cellules
      if (el.name === "img") {
        const src = $el.attr("src");
        // Exclure les bannières animées et icônes système (.gif)
        if (src && !src.endsWith(".gif") && !src.includes("contact")) {
          if (!currentGallery.includes(src)) {
            currentGallery.push(src);
          }
        }
        return;
      }

      // Cas 2 : Traitement des blocs de texte
      const text = $el.text().replace(/\s+/g, " ").trim();

      // Filtrer les textes trop courts ou les avertissements du header
      if (text.length > 20 && !text.includes("Important :") && !text.includes("Glauque Land")) {
        // Ignorer les conteneurs parents pour éviter de doubler le texte des paragraphes enfants
        if ($el.find("p").length > 0 && el.name !== "p") return;

        // Dès qu'un texte est rencontré, on ferme la galerie précédente
        flushGallery();

        // Éviter d'ajouter deux fois le même paragraphe
        const isDuplicate = blocks.some((b) => b.type === "text" && b.content === text);
        if (!isDuplicate) {
          blocks.push({ type: "text", content: text });
        }
      }
    });

    // Vider les dernières images si le document se termine par une galerie
    flushGallery();

    // Affichage du résumé séquentiel dans la console
    console.log(`--- SÉQUENCE DÉTECTÉE (${blocks.length} blocs) ---\n`);
    blocks.forEach((block, index) => {
      if (block.type === "text") {
        console.log(`[Bloc ${index + 1} - TEXTE] : "${block.content.substring(0, 60)}..."`);
      } else {
        console.log(`[Bloc ${index + 1} - GALERIE] : ${block.count} image(s) (${block.images[0]})`);
      }
    });
    console.log("\n-------------------------------------------");
  } catch (err) {
    console.error("Erreur de test :", err);
  }
}

testStructure();