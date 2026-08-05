const fs = require("fs-extra");
const path = require("path");
const glob = require("fast-glob");
const cheerio = require("cheerio");

// Configuration des dossiers sources et de destination
const INPUT_DIR = __dirname;
const OUTPUT_DIR = path.join(__dirname, "dist"); // Les fichiers nettoyés iront dans "dist/"

/**
 * Nettoie une chaîne de caractères (supprime les espaces multiples et les sauts de ligne inutiles)
 */
function cleanText(text) {
  return text ? text.replace(/\s+/g, " ").trim() : "";
}

/**
 * Extraite les métadonnées SEO et OpenGraph du document HTML
 */
function extractMetadata($) {
  const pageTitle = cleanText($("title").text()) || "Glauque Land";

  // Déduire le titre du lieu (en retirant le préfixe "Glauque Land > ")
  const locationTitle = pageTitle
    .replace(/^Glauque\s+Land\s*>&nbsp;|\s*>&nbsp;|\s*>\s*/i, "")
    .trim();

  return {
    pageTitle,
    locationTitle,
    metaDescription:
      $('meta[name="description"]').attr("content") ||
      "Urbex : Glauque-Land - Lieux abandonnés en France et Europe",
    metaKeywords:
      $('meta[name="keywords"]').attr("content") ||
      "urbex, exploration urbaine",
    ogImage: $('meta[property="og:image"]').attr("content") || "",
    ogUrl: $('meta[property="og:url"]').attr("content") || "",
  };
}

/**
 * Cherche et extrait le bloc d'avertissement de confidentialité (souvent identifié par "Important :")
 */
function extractWarningText($) {
  let warningText = "";
  $("table, p, span").each((_, el) => {
    const text = $(el).text();
    if (text.includes("Important :") && !warningText) {
      warningText = cleanText(text);
    }
  });
  return warningText;
}

/**
 * Parcourt le DOM pour extraire séquentiellement les blocs de texte et les galeries d'images
 */
function extractBodyElements($, locationTitle, warningText) {
  const bodyElements = [];

  $("body")
    .find("table, p")
    .each((_, el) => {
      const $el = $(el);

      // Ignorer l'en-tête déjà traité et les éléments du footer
      if ($el.find('img[src*="contact.gif"], img[src*="lien"]').length > 0)
        return;
      if ($el.text().includes("Important :") && warningText) return;

      const imgs = $el.find("img");
      const text = cleanText($el.text());

      // CAS 1 : Bloc d'images
      if (imgs.length > 0) {
        const imageList = [];
        imgs.each((_, imgEl) => {
          const src = $(imgEl).attr("src");
          const alt = $(imgEl).attr("alt") || locationTitle;
          const parentLink = $(imgEl).parent("a").attr("href");

          // Ne pas inclure la bannière GIF ou les boutons de liens
          if (src && !src.endsWith(".gif") && !src.includes("contact")) {
            imageList.push({ src, alt, link: parentLink || null });
          }
        });

        if (imageList.length > 0) {
          bodyElements.push({ type: "gallery", images: imageList });
        }
      }
      // CAS 2 : Bloc de texte narratif
      else if (text.length > 3) {
        const isCentered =
          $el.find('[align="center"]').length > 0 ||
          $el.attr("align") === "center";

        bodyElements.push({
          type: "text",
          content: text,
          centered: isCentered,
        });
      }
    });

  return bodyElements;
}

/**
 * Extraite la navigation secondaire du footer (liens vers lieux associés et bouton de contact)
 */
function extractFooterData($) {
  const relatedLinks = [];

  $("a").each((_, aEl) => {
    const $a = $(aEl);
    const href = $a.attr("href");
    const img = $a.find("img");

    if (img.length > 0 && href) {
      const imgSrc = img.attr("src");

      // Utilisation du chaînage optionnel (?.) pour éviter toute erreur si imgSrc est undefined
      if (imgSrc?.includes("lien")) {
        relatedLinks.push({
          href,
          src: imgSrc,
          alt: img.attr("alt") || "Visiter le lieu",
        });
      }
    }
  });

  return {
    relatedLinks,
    contactHref:
      $('a[href*="contact"]').attr("href") || "../contact/contact.htm",
    contactImgSrc:
      $('a[href*="contact"] img').attr("src") || "../contact/contact.gif",
  };
}

/**
 * Assemble et génère le code HTML final sémantique et réorganisé
 */
function generateHtmlTemplate(
  meta,
  titleBannerImg,
  warningText,
  bodyElements,
  footerData,
) {
  // Génération dynamique des sections du corps de page (<section>)
  const sectionsHtml = bodyElements
    .map((item) => {
      if (item.type === "text") {
        const centerClass = item.centered ? " text-center" : "";
        return `    <section class="text-block${centerClass}">\n      <p>${item.content}</p>\n    </section>`;
      }

      if (item.type === "gallery") {
        const imagesHtml = item.images
          .map((img) =>
            img.link
              ? `      <a href="${img.link}"><img src="${img.src}" alt="${img.alt}"></a>`
              : `      <img src="${img.src}" alt="${img.alt}">`,
          )
          .join("\n");

        return `    <section class="photo-gallery">\n${imagesHtml}\n    </section>`;
      }
      return "";
    })
    .join("\n\n");

  // Génération dynamique de la navigation footer
  const relatedNavHtml =
    footerData.relatedLinks.length > 0
      ? `\n      <nav class="related-links" aria-label="Visites associées">\n` +
        footerData.relatedLinks
          .map(
            (link) =>
              `        <a href="${link.href}"><img src="${link.src}" alt="${link.alt}"></a>`,
          )
          .join("\n") +
        `\n      </nav>`
      : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>${meta.pageTitle}</title>

  <meta name="keywords" content="${meta.metaKeywords}">
  <meta name="description" content="${meta.metaDescription}">
  <meta name="author" content="Tim / Timothy Hannem">
  <meta name="owner" content="Tim / Timothy Hannem">
  <meta name="copyright" content="Tim / Timothy Hannem">
  <meta name="robots" content="all">

  <meta property="og:title" content="${meta.pageTitle}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${meta.ogUrl}">
  <meta property="og:image" content="${meta.ogImage}">

  <link rel="SHORTCUT ICON" href="http://www.glauqueland.com/favicon.ico">

  <link rel="stylesheet" href="../global.css">
  <link rel="stylesheet" href="../article.css">
</head>
<body>

  <main class="album-container">

    <header class="album-header">
      <h1 class="visually-hidden">${meta.locationTitle}</h1>
      ${titleBannerImg ? `<img src="${titleBannerImg}" alt="${meta.locationTitle}" class="title-banner-img">` : ""}
      ${warningText ? `<div class="warning-box">\n        <p>${warningText}</p>\n      </div>` : ""}
    </header>

${sectionsHtml}

    <footer class="album-footer">${relatedNavHtml}
      <div class="contact-link">
        <a href="${footerData.contactHref}">
          <img src="${footerData.contactImgSrc}" alt="Me contacter par mail">
        </a>
      </div>
    </footer>

  </main>

</body>
</html>`;
}

/**
 * Traite un fichier HTML d'origine et génère la version restructurée
 */
async function processFile(filePath) {
  const relativePath = path.relative(INPUT_DIR, filePath);

  // Ignorer les fichiers de la racine (index.html, index-2.html) et le dossier de sortie dist/
  if (!relativePath.includes(path.sep) || relativePath.startsWith("dist")) {
    return;
  }

  const htmlContent = await fs.readFile(filePath, "utf-8");
  const $ = cheerio.load(htmlContent, { decodeEntities: false });

  // 1. Extraction modulaire des données de la page
  const meta = extractMetadata($);
  const warningText = extractWarningText($);
  const titleBannerImg = $('img[src$=".gif"]').first().attr("src") || "";
  const bodyElements = extractBodyElements($, meta.locationTitle, warningText);
  const footerData = extractFooterData($);

  // 2. Génération du HTML nettoyé
  const finalHtml = generateHtmlTemplate(
    meta,
    titleBannerImg,
    warningText,
    bodyElements,
    footerData,
  );

  // 3. Écriture du fichier transformé dans le dossier dist/
  const outputPath = path.join(OUTPUT_DIR, relativePath);
  await fs.ensureDir(path.dirname(outputPath));
  await fs.writeFile(outputPath, finalHtml, "utf-8");

  console.log(`✅ Transformé : ${relativePath}`);
}

/**
 * Fonction principale de lancement
 */
async function run() {
  try {
    console.log("🚀 Début de la conversion des fichiers HTML...");

    // Recherche récursive de tous les fichiers HTML/HTM en ignorant node_modules et dist
    const files = await glob("**/*.{html,htm,HTML,HTM}", {
      cwd: INPUT_DIR,
      absolute: true,
      ignore: ["node_modules/**", "dist/**"],
    });

    for (const file of files) {
      await processFile(file);
    }

    console.log(
      "\n🎉 Conversion terminée avec succès ! Les fichiers nettoyés sont dans le dossier /dist.",
    );
  } catch (error) {
    console.error("❌ Erreur pendant la conversion :", error);
  }
}

run();
