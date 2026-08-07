const fs = require("fs-extra");
const cheerio = require("cheerio");
const path = require("path");

const FILE_TO_TEST = "./absence/index.htm";

/**
 * Nettoie le contenu d'un paragraphe pour conserver les liens <a>
 * tout en supprimant les balises obsolètes (<font>, <span>, styles inline).
 */
function cleanParagraphContent($el, $) {
  const $clone = $el.clone();

  // Supprime les images éventuellement imbriquées dans le texte
  $clone.find("img").remove();

  // Nettoie les attributs obsolètes de tous les éléments enfants
  $clone.find("*").each((_, child) => {
    const $child = $(child);
    const attribs = Object.keys(child.attribs || {});

    attribs.forEach((attr) => {
      // Conserve uniquement href, target et rel sur les balises <a>
      if (child.name === "a" && ["href", "target", "rel"].includes(attr.toLowerCase())) {
        return;
      }
      $child.removeAttr(attr);
    });

    // Déballe les balises de présentation obsolètes (<font>, <span>, <center>)
    if (["font", "span", "center"].includes(child.name)) {
      $child.replaceWith($child.contents());
    }
  });

  let innerHtml = $clone.html() || "";
  return innerHtml.replace(/\s+/g, " ").trim();
}

async function testGeneration() {
  const blocks = [];
  let currentGallery = [];

  function flushGallery() {
    if (currentGallery.length > 0) {
      blocks.push({
        type: "gallery",
        images: [...currentGallery],
      });
      currentGallery = [];
    }
  }

  try {
    // 1. Lecture UTF-8
    const content = await fs.readFile(FILE_TO_TEST, "utf-8");
    const $ = cheerio.load(content, { decodeEntities: false });

    // Titre du lieu
    const pageTitle = $("title").text().replace(/\s+/g, " ").trim() || "Glauque Land";
    const locationTitle = pageTitle.replace(/^Glauque\s+Land\s*>&nbsp;|\s*>&nbsp;|\s*>\s*/i, "").trim();

    // Image de bannière du header (.gif)
    const titleBannerImg = $('img[src$=".gif"], img[src$=".GIF"]').first().attr("src") || "";

    // 2. Extraction séquentielle
    $("body").find("table, p, div, img").each((_, el) => {
      const $el = $(el);

      if (el.name === "img") {
        const src = $el.attr("src");
        if (src && !src.endsWith(".gif") && !src.includes("contact")) {
          const alt = $el.attr("alt")?.trim() || locationTitle;
          const parentLink = $el.parent("a").attr("href") || null;

          if (!currentGallery.some((img) => img.src === src)) {
            currentGallery.push({ src, alt, link: parentLink });
          }
        }
        return;
      }

      const textClean = $el.text().replace(/\s+/g, " ").trim();

      if (textClean.length > 20 && !textClean.includes("Important :") && !textClean.includes("Glauque Land")) {
        if ($el.find("p").length > 0 && el.name !== "p") return;

        flushGallery();

        const htmlContent = cleanParagraphContent($el, $);

        const isDuplicate = blocks.some((b) => b.type === "text" && b.content === htmlContent);
        if (!isDuplicate && htmlContent) {
          blocks.push({ type: "text", content: htmlContent });
        }
      }
    });

    flushGallery();

    // 3. Extraction des liens du footer
    const relatedLinks = [];
    $("a").each((_, aEl) => {
      const $a = $(aEl);
      const href = $a.attr("href");
      const img = $a.find("img");

      if (img.length > 0 && href) {
        const imgSrc = img.attr("src");
        if (imgSrc?.toLowerCase().includes("lien")) {
          relatedLinks.push({
            href,
            src: imgSrc,
            alt: img.attr("alt") || "Visiter le lieu",
          });
        }
      }
    });

    const contactHref = $('a[href*="contact"]').attr("href") || "../contact/";
    const contactImgSrc = $('a[href*="contact"] img').attr("src") || "../contact/contact.gif";

    // 4. Génération du HTML moderne
    const sectionsHtml = blocks
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

    const relatedNavHtml =
      relatedLinks.length > 0
        ? `\n      <nav class="related-links" aria-label="Visites associées">\n` +
          relatedLinks.map((l) => `        <a href="${l.href}"><img src="${l.src}" alt="${l.alt}"></a>`).join("\n") +
          `\n      </nav>`
        : "";

    const finalHtml = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>${pageTitle}</title>

  <meta name="keywords" content="${$('meta[name="keywords"], meta[name="Keywords"]').attr("content") || "urbex, exploration urbaine"}">
  <meta name="description" content="${$('meta[name="description"], meta[name="Description"]').attr("content") || "Urbex : Glauque-Land"}">
  <meta name="author" content="Tim / Timothy Hannem">
  <meta name="robots" content="all">

  <meta property="og:title" content="${pageTitle}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${$('meta[property="og:url"]').attr("content") || ""}">
  <meta property="og:image" content="${$('meta[property="og:image"]').attr("content") || ""}">

  <link rel="shortcut icon" href="../favicon.ico">

  <link rel="stylesheet" href="../global.css">
  <link rel="stylesheet" href="../article.css">
</head>
<body>

  <main class="album-container">

    <header class="album-header">
      <h1 class="visually-hidden">${locationTitle}</h1>
      ${titleBannerImg ? `<img src="${titleBannerImg}" alt="${locationTitle}" class="title-banner-img">` : ""}
      <div class="warning-box">
        <p><strong>Important :</strong> Pour des raisons de confidentialité, de conservation, de sécurité (etc) je ne donnerai pas la localisation de cet endroit. Merci de votre compréhension.</p>
      </div>
    </header>

${sectionsHtml}

    <footer class="album-footer">${relatedNavHtml}
      <div class="contact-link">
        <a href="${contactHref}">
          <img src="${contactImgSrc}" alt="Me contacter par mail">
        </a>
      </div>
    </footer>

  </main>

</body>
</html>`;

    // Écriture du fichier HTML généré
    const targetFile = path.join(path.dirname(FILE_TO_TEST), "index.html");
    await fs.writeFile(targetFile, finalHtml, "utf-8");

    console.log(`✅ Fichier généré avec succès : ${targetFile}`);
  } catch (err) {
    console.error("Erreur de génération :", err);
  }
}

testGeneration();