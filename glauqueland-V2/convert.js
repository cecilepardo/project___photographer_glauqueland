const fs = require("fs-extra");
const path = require("path");
const glob = require("fast-glob");
const cheerio = require("cheerio");

const INPUT_DIR = __dirname;

/**
 * 1. Lit le fichier d'origine ISO-8859-1 / Windows-1252
 * Cheerio convertira naturellement les entités (&eacute;) et le Latin-1 en UTF-8 propre.
 */
async function readHtmlFile(filePath) {
  const buffer = await fs.readFile(filePath);
  const decoder = new TextDecoder("windows-1252");
  return decoder.decode(buffer);
}

/**
 * Nettoie le texte sans altérer son contenu.
 */
function cleanText(text) {
  return text ? text.replace(/\s+/g, " ").trim() : "";
}

/**
 * Extrait les métadonnées de la page d'origine
 */
function extractMetadata($) {
  const pageTitle = cleanText($("title").text()) || "Glauque Land";
  const locationTitle = pageTitle
    .replace(/^Glauque\s+Land\s*>&nbsp;|\s*>&nbsp;|\s*>\s*/i, "")
    .trim();

  return {
    pageTitle,
    locationTitle,
    metaDescription:
      cleanText($('meta[name="Description"], meta[name="description"]').attr("content")) ||
      "Urbex : Glauque-Land - Lieux abandonnés en France et Europe",
    metaKeywords:
      cleanText($('meta[name="Keywords"], meta[name="keywords"]').attr("content")) ||
      "urbex, exploration urbaine",
    ogImage: $('meta[property="og:image"]').attr("content") || "",
    ogUrl: $('meta[property="og:url"]').attr("content") || "",
  };
}

/**
 * 2. Parcours séquentiel exact de la structure pour alterner texte et galeries
 */
function extractContentSequentially($, locationTitle, titleBannerImg) {
  const bodyElements = [];
  let currentGallery = [];

  function flushGallery() {
    if (currentGallery.length > 0) {
      bodyElements.push({ type: "gallery", images: [...currentGallery] });
      currentGallery = [];
    }
  }

  // Parcours des conteneurs de premier niveau (tables, divs, p isolés)
  $("body")
    .find("table, p, div")
    .each((_, el) => {
      const $el = $(el);

      // Si l'élément contient uniquement ou principalement des images (hors boutons footer/header)
      const imgs = $el.find("img");

      if (imgs.length > 0) {
        let hasGalleryImg = false;

        imgs.each((_, imgEl) => {
          const $img = $(imgEl);
          const src = $img.attr("src") || $img.attr("SRC");
          if (!src) return;

          const srcLower = src.toLowerCase();
          const isBanner = titleBannerImg && src === titleBannerImg;
          const isSystem =
            srcLower.includes("contact") ||
            srcLower.includes("lien") ||
            srcLower.includes("favicon") ||
            srcLower.endsWith(".gif");

          // Si c'est une image de la galerie de photos
          if (!isBanner && !isSystem) {
            // Remplir alt s'il est vide
            const altText = cleanText($img.attr("alt")) || locationTitle;
            const parentLink = $img.parent("a").attr("href");

            if (!currentGallery.some((item) => item.src === src)) {
              currentGallery.push({
                src,
                alt: altText,
                link: parentLink || null,
              });
              hasGalleryImg = true;
            }
          }
        });

        if (hasGalleryImg) return;
      }

      // Si c'est un bloc contenant du texte
      const text = cleanText($el.text());

      // On filtre les phrases d'avertissement déjà incluses dans le header ou bruits de structure
      if (
        text.length > 5 &&
        !text.includes("Important :") &&
        !text.includes("Glauque Land")
      ) {
        // Ignorer si ce paragraphe est le conteneur parent d'un sous-paragraphe qu'on traitera après
        if ($el.find("p").length > 0 && el.name !== "p") return;

        flushGallery();

        // Éviter d'ajouter deux fois le même paragraphe de texte
        const isDuplicate = bodyElements.some(
          (b) => b.type === "text" && b.content === text
        );

        if (!isDuplicate) {
          bodyElements.push({ type: "text", content: text });
        }
      }
    });

  flushGallery();
  return bodyElements;
}

/**
 * 3. Extrait les liens connexes du footer
 */
function extractFooterData($) {
  const relatedLinks = [];

  $("a").each((_, aEl) => {
    const $a = $(aEl);
    const href = $a.attr("href");
    const img = $a.find("img");

    if (img.length > 0 && href) {
      const imgSrc = img.attr("src") || img.attr("SRC");
      if (imgSrc?.toLowerCase().includes("lien")) {
        relatedLinks.push({
          href,
          src: imgSrc,
          alt: cleanText(img.attr("alt")) || "Visiter le lieu",
        });
      }
    }
  });

  return {
    relatedLinks,
    contactHref: $('a[href*="contact"]').attr("href") || "../contact/",
    contactImgSrc: $('a[href*="contact"] img').attr("src") || "../contact/contact.gif",
  };
}

/**
 * 4. Génération du HTML moderne et propre
 */
function buildModernHtml(meta, titleBannerImg, bodyElements, footerData) {
  const sections = bodyElements
    .map((item) => {
      if (item.type === "text") {
        return `    <section class="text-block">\n      <p>${item.content}</p>\n    </section>`;
      }
      if (item.type === "gallery") {
        const imgs = item.images
          .map((img) =>
            img.link
              ? `      <a href="${img.link}" target="_blank" rel="noopener"><img src="${img.src}" alt="${img.alt}"></a>`
              : `      <img src="${img.src}" alt="${img.alt}">`
          )
          .join("\n");
        return `    <section class="photo-gallery">\n${imgs}\n    </section>`;
      }
      return "";
    })
    .join("\n\n");

  const relatedNav =
    footerData.relatedLinks.length > 0
      ? `\n      <nav class="related-links" aria-label="Visites associées">\n` +
        footerData.relatedLinks
          .map((l) => `        <a href="${l.href}"><img src="${l.src}" alt="${l.alt}"></a>`)
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

  <link rel="shortcut icon" href="../favicon.ico">

  <link rel="stylesheet" href="../global.css">
  <link rel="stylesheet" href="../article.css">
</head>
<body>

  <main class="album-container">

    <header class="album-header">
      <h1 class="visually-hidden">${meta.locationTitle}</h1>
      ${titleBannerImg ? `<img src="${titleBannerImg}" alt="${meta.locationTitle}" class="title-banner-img">` : ""}
      <div class="warning-box">
        <p><strong>Important :</strong> Pour des raisons de confidentialité, de conservation, de sécurité (etc) je ne donnerai pas la localisation de cet endroit. Merci de votre compréhension.</p>
      </div>
    </header>

${sections}

    <footer class="album-footer">${relatedNav}
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
 * Nettoyage des sauvegardes oldindex
 */
async function removeOldIndexFiles(dirPath) {
  const oldFiles = await glob(["oldindex.*", "OLDINDEX.*"], {
    cwd: dirPath,
    absolute: true,
  });
  for (const f of oldFiles) {
    await fs.remove(f);
  }
}

/**
 * Traitement d'un fichier
 */
async function processFile(filePath) {
  const relativePath = path.relative(INPUT_DIR, filePath);
  if (!relativePath.includes(path.sep)) return;

  const dirPath = path.dirname(filePath);

  // 1. Supprimer oldindex s'ils existent
  await removeOldIndexFiles(dirPath);

  // 2. Lire le fichier d'origine
  const rawHtml = await readHtmlFile(filePath);
  const $ = cheerio.load(rawHtml, { decodeEntities: false });

  // 3. Extraire les éléments
  const meta = extractMetadata($);
  const titleBannerImg = $('img[src$=".gif"], img[src$=".GIF"]').first().attr("src") || "";
  const bodyElements = extractContentSequentially($, meta.locationTitle, titleBannerImg);
  const footerData = extractFooterData($);

  // 4. Construire le HTML moderne
  const modernHtml = buildModernHtml(meta, titleBannerImg, bodyElements, footerData);

  // 5. Sauvegarder sous format index.html
  const targetFilePath = path.join(dirPath, "index.html");
  await fs.writeFile(targetFilePath, modernHtml, "utf-8");

  // Si l'ancien fichier était un .htm ou s'appelait différemment d'index.html, on le nettoie
  if (filePath !== targetFilePath) {
    await fs.remove(filePath);
    console.log(`✅ Converti : ${relativePath} ➔ ${path.relative(INPUT_DIR, targetFilePath)}`);
  } else {
    console.log(`✅ Mis à jour sur place : ${relativePath}`);
  }
}

async function run() {
  try {
    console.log("🚀 Conversion propre en cours à partir des fichiers originaux...");

    const files = await glob("**/*.{html,htm,HTML,HTM}", {
      cwd: INPUT_DIR,
      absolute: true,
      ignore: ["node_modules/**", "**/oldindex.*", "index.html", "map.html"],
    });

    for (const file of files) {
      await processFile(file);
    }

    console.log("\n🎉 Opération terminée avec succès !");
  } catch (err) {
    console.error("❌ Erreur :", err);
  }
}

run();