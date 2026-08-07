const fs = require("fs-extra");
const path = require("path");
const glob = require("fast-glob");
const cheerio = require("cheerio");

// ==========================================================================
// CONFIGURATION DES DOSSIERS ET FICHIERS
// ==========================================================================
const INPUT_DIR = __dirname;
const OUTPUT_DIR = path.join(__dirname, "dist");
const REPORT_FILE = path.join(__dirname, "audit-report.json");

// ==========================================================================
// FONCTIONS UTILITAIRES DE NETTOYAGE
// ==========================================================================

/**
 * Nettoie une chaîne de caractères pour supprimer les sauts de ligne et espaces superflus
 */
function cleanText(text) {
  return text ? text.replace(/\s+/g, " ").trim() : "";
}

// ==========================================================================
// MODULES DE VÉRIFICATION INDIVIDUELS
// ==========================================================================

/**
 * 1. Vérification des images : compare le nombre de photos d'album (hors bannières et boutons système)
 */
function checkGalleryImages($orig, $dist, warnings) {
  // Détection insensible à la casse de la première image GIF (bannière de titre)
  const titleBannerImg =
    $orig("img")
      .filter((_, el) => {
        const src = $orig(el).attr("src") || "";
        return src.toLowerCase().endsWith(".gif");
      })
      .first()
      .attr("src") || "";

  // Extraction des images de la source d'origine (hors bannières et éléments système)
  const origImgs = [];
  $orig("img").each((_, el) => {
    const src = $orig(el).attr("src");
    const isTitleBanner = titleBannerImg && src === titleBannerImg;
    const isSystemImg = src?.includes("contact") || src?.includes("lien");

    if (src && !isTitleBanner && !isSystemImg) {
      origImgs.push(src);
    }
  });

  // Extraction des images dans la galerie du HTML nettoyé
  const distImgs = [];
  $dist(".photo-gallery img").each((_, el) => {
    const src = $dist(el).attr("src");
    if (src) distImgs.push(src);
  });

  if (origImgs.length !== distImgs.length) {
    warnings.push(
      `Écart d'images : ${origImgs.length} d'origine vs ${distImgs.length} dans dist`,
    );
  }

  return {
    origCount: origImgs.length,
    distCount: distImgs.length,
  };
}

/**
 * 2. Vérification de la navigation footer : s'assure qu'aucun lien d'album connexe n'est perdu
 */
function checkRelatedLinks($orig, $dist, warnings) {
  const origNavLinks = [];
  $orig('a[href*="../"]').each((_, el) => {
    const href = $orig(el).attr("href");
    const imgSrc = $orig(el).find("img").attr("src");
    if (imgSrc?.includes("lien")) {
      origNavLinks.push(href);
    }
  });

  const distNavLinks = [];
  $dist(".related-links a").each((_, el) => {
    const href = $dist(el).attr("href");
    if (href) distNavLinks.push(href);
  });

  if (origNavLinks.length !== distNavLinks.length) {
    warnings.push(
      `Écart de liens d'albums connexes : ${origNavLinks.length} d'origine vs ${distNavLinks.length} dans dist`,
    );
  }
}

/**
 * 3. Vérification du volume de texte : alerte si le volume chute de plus de 15% par rapport à l'origine
 */
function checkTextVolume($orig, $dist, warnings) {
  const origTextLength = cleanText($orig("body").text()).length;
  const distTextLength = cleanText($dist(".album-container").text()).length;

  if (origTextLength > 0 && distTextLength / origTextLength < 0.85) {
    warnings.push(
      `Perte potentielle de texte : ${origTextLength} chars d'origine vs ${distTextLength} chars dans dist`,
    );
  }
}

/**
 * 4. Vérification de l'accessibilité : contrôle la présence des attributs 'alt' sur les images de galerie
 */
function checkImageAltAttributes($dist, warnings) {
  let missingAltCount = 0;
  $dist(".photo-gallery img").each((_, el) => {
    const alt = $dist(el).attr("alt");
    if (!alt || alt.trim() === "") {
      missingAltCount++;
    }
  });

  if (missingAltCount > 0) {
    warnings.push(`${missingAltCount} image(s) sans attribut 'alt'`);
  }
}

// ==========================================================================
// AUDIT PAR FICHIER
// ==========================================================================

/**
 * Analyse un fichier HTML d'origine et son équivalent transformé et écrasé
 */
async function auditFile(filePath) {
  const relativePath = path.relative(INPUT_DIR, filePath);
  const htmlContent = await fs.readFile(filePath, "utf-8");
  const $ = cheerio.load(htmlContent, { decodeEntities: false });

  const warnings = [];

  // 1. Contrôle de la structure HTML5 minimale
  if ($(".album-container").length === 0) {
    warnings.push("Structure HTML5 (.album-container) manquante");
  }

  // 2. Contrôle des images de la galerie
  const galleryImgsCount = $(".photo-gallery img").length;
  if (galleryImgsCount === 0) {
    warnings.push("Aucune photo trouvée dans la galerie (.photo-gallery)");
  }

  // 3. Contrôle des attributs alt manquants
  let missingAltCount = 0;
  $(".photo-gallery img").each((_, el) => {
    const alt = $(el).attr("alt");
    if (!alt || alt.trim() === "") {
      missingAltCount++;
    }
  });

  if (missingAltCount > 0) {
    warnings.push(`${missingAltCount} image(s) de galerie sans attribut 'alt'`);
  }

  // 4. Contrôle du volume de texte
  const textLength = cleanText($(".album-container").text()).length;
  if (textLength < 50) {
    warnings.push("Volume de texte anormalement faible");
  }

  return {
    file: relativePath,
    status: warnings.length === 0 ? "OK" : "WARNING",
    distImages: galleryImgsCount,
    warnings,
  };
}

// ==========================================================================
// FONCTION PRINCIPALE D'EXÉCUTION
// ==========================================================================

/**
 * LANCE L'AUDIT GLOBAL SUR TOUS LES FICHIERS DU PROJET
 */
async function runAudit() {
  try {
    console.log(
      "🔍 Lancement de l'audit et de la vérification des fichiers...\n",
    );

    // Recherche de tous les fichiers HTML/HTM en ignorant les dossiers dist, node_modules et fichiers old
    const files = await glob("**/*.{html,htm,HTML,HTM}", {
      cwd: INPUT_DIR,
      absolute: true,
      ignore: ["node_modules/**", "dist/**", "**/old*.*", "**/OLD*.*"],
    });

    const results = [];
    let okCount = 0;
    let warningCount = 0;
    let missingCount = 0;

    for (const file of files) {
      const relativePath = path.relative(INPUT_DIR, file);

      // Ignorer les fichiers situés directement à la racine
      if (!relativePath.includes(path.sep)) continue;

      const report = await auditFile(file);
      results.push(report);

      // Affichage console propre et formaté
      if (report.status === "OK") {
        okCount++;
        console.log(`✅ [OK] ${report.file}`);
      } else if (report.status === "WARNING") {
        warningCount++;
        console.log(`⚠️  [ATTENTION] ${report.file}`);
        report.warnings.forEach((w) => {
          console.log(`   └─ ${w}`);
        });
      } else {
        missingCount++;
        console.log(`❌ [MANQUANT] ${report.file}`);
      }
    }

    // Génération du rapport au format JSON pour enregistrement
    await fs.writeJson(REPORT_FILE, results, { spaces: 2 });

    console.log("\n==========================================");
    console.log("📊 RÉSUMÉ DE L'AUDIT");
    console.log("==========================================");
    console.log(`Fichiers analysés : ${results.length}`);
    console.log(`- Conformes (OK)   : ${okCount}`);
    console.log(`- Avertissements   : ${warningCount}`);
    console.log(`- Fichiers manqués : ${missingCount}`);
    console.log(`\n📄 Rapport détaillé généré dans : audit-report.json`);
  } catch (error) {
    console.error("❌ Erreur pendant l'audit :", error);
  }
}

runAudit();
