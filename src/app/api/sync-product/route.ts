import { NextRequest, NextResponse } from "next/server";

// Module-level cache for WooCommerce global attributes to avoid redundant API calls during the sync loop
let globalAttributesCache: any[] | null = null;
let lastCacheTime = 0;
const CACHE_TTL = 60000; // 1 minute cache TTL

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { wooConfig, product, mapping, priceMultiplier, priceAddition, attributeMappings, existingProduct: passedExistingProduct, syncOnlyStockPrice } = body;
    const attrsMap: any[] = Array.isArray(attributeMappings) ? attributeMappings : [];

    if (!wooConfig || !wooConfig.url || !wooConfig.consumerKey || !wooConfig.consumerSecret) {
      return NextResponse.json(
        { success: false, error: "WooCommerce bağlantı bilgileri eksik." },
        { status: 400 }
      );
    }

    if (!product || !mapping || !mapping.skuField) {
      return NextResponse.json(
        { success: false, error: "Ürün verileri veya SKU eşleştirmesi eksik." },
        { status: 400 }
      );
    }

    const sku = String(product[mapping.skuField] || "").trim();
    if (!sku) {
      return NextResponse.json(
        { success: false, error: `Seçilen SKU alanı (${mapping.skuField}) bu ürün için boş.` },
        { status: 400 }
      );
    }

    // Sanitize WooCommerce Base URL
    let baseUrl = wooConfig.url.trim();
    if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
      baseUrl = "https://" + baseUrl;
    }
    baseUrl = baseUrl.replace(/\/+$/, ""); // Remove trailing slashes

    const authHeader = `Basic ${Buffer.from(`${wooConfig.consumerKey}:${wooConfig.consumerSecret}`).toString("base64")}`;

    // Fetch and cache WooCommerce global attributes to check for filter IDs
    let globalAttributes = globalAttributesCache;
    const now = Date.now();
    if (!globalAttributes || (now - lastCacheTime > CACHE_TTL)) {
      try {
        const attributesUrl = `${baseUrl}/wp-json/wc/v3/products/attributes?_=${Date.now()}`;
        const attrResponse = await fetch(attributesUrl, {
          method: "GET",
          headers: {
            "Authorization": authHeader,
            "Accept": "application/json",
          },
          cache: "no-store",
          next: { revalidate: 0 }
        });
        if (attrResponse.ok) {
          globalAttributes = await attrResponse.json();
          globalAttributesCache = globalAttributes;
          lastCacheTime = now;
        }
      } catch (err) {
        console.error("Failed to fetch WooCommerce global attributes:", err);
      }
    }
    const globalAttrsList = Array.isArray(globalAttributes) ? globalAttributes : [];

    const findGlobalAttributeId = (name: string): number => {
      if (!name) return 0;
      const matched = globalAttrsList.find(
        (a: any) => String(a.name || "").toLowerCase() === name.toLowerCase()
      );
      return matched ? matched.id : 0;
    };

    // Get mapped values from the XML product
    const name = String(product[mapping.nameField] || "").trim();
    const priceStr = String(product[mapping.priceField] || "0").trim().replace(",", "."); // Handle comma decimal separators
    
    // Calculate final price: (XML Price * Multiplier) + Addition
    const rawPrice = parseFloat(priceStr) || 0;
    const multiplier = parseFloat(priceMultiplier) || 1;
    const addition = parseFloat(priceAddition) || 0;
    const price = Math.round((rawPrice * multiplier + addition) * 100) / 100;
    const stock = parseInt(product[mapping.stockField] || "0", 10) || 0;
    let description = String(product[mapping.descriptionField] || "").trim();
    // Replace supplier name "Filiz Aksesuar" with "Setifera"
    description = description.replace(/Filiz Aksesuar/gi, "Setifera");

    // Map images
    const imageFields = mapping.imageFields || [];
    const images = imageFields
      .map((field: string) => product[field])
      .filter((val: any) => typeof val === "string" && val.trim() !== "")
      .map((url: string) => ({ src: url.trim() }));

    // 1. Search if the product already exists in WooCommerce by SKU (skip if passedExistingProduct is provided)
    let existingProduct = passedExistingProduct || null;
    let exists = !!existingProduct;

    if (!exists) {
      const searchUrl = `${baseUrl}/wp-json/wc/v3/products?sku=${encodeURIComponent(sku)}&status=any&_=${Date.now()}`;
      
      const searchResponse = await fetch(searchUrl, {
        method: "GET",
        headers: {
          "Authorization": authHeader,
          "Accept": "application/json",
        },
        cache: "no-store",
        next: { revalidate: 0 }
      });

      if (!searchResponse.ok) {
        const errText = await searchResponse.text();
        return NextResponse.json(
          { success: false, error: `WooCommerce ürün arama hatası (HTTP ${searchResponse.status}): ${errText}` },
          { status: 400 }
        );
      }

      const matchedProducts = await searchResponse.json();
      if (Array.isArray(matchedProducts) && matchedProducts.length > 0) {
        existingProduct = matchedProducts[0];
        exists = true;
      }
    }

    if (exists && existingProduct) {
      const existingId = existingProduct.id;

      // Compare fields to see if updates are needed
      const updateData: any = {};
      const changes: string[] = [];

      // Compare Name
      if (!syncOnlyStockPrice && existingProduct.name !== name && name !== "") {
        updateData.name = name;
        changes.push(`İsim: "${existingProduct.name}" -> "${name}"`);
      }

      // Compare Price
      const existingPrice = parseFloat(existingProduct.regular_price || "0");
      if (existingPrice !== price) {
        updateData.regular_price = price.toString();
        changes.push(`Fiyat: ${existingPrice} -> ${price}`);
      }

      // Compare Stock (check if stock quantity is managed and differs)
      const existingStock = existingProduct.stock_quantity ?? 0;
      const isStockManaged = existingProduct.manage_stock === true;
      if (!isStockManaged || existingStock !== stock) {
        updateData.manage_stock = true;
        updateData.stock_quantity = stock;
        // In WooCommerce, we also set stock status based on stock count
        updateData.stock_status = stock > 0 ? "instock" : "outofstock";
        changes.push(`Stok: ${existingStock} (Yönetim: ${isStockManaged ? 'Açık' : 'Kapalı'}) -> ${stock}`);
      }

      // Compare Description
      if (!syncOnlyStockPrice) {
        const existingDesc = (existingProduct.description || "").trim();
        if (existingDesc !== description && description !== "") {
          updateData.description = description;
          changes.push("Açıklama güncellendi");
        }
      }

      // Compare Images (simplified URL match)
      if (!syncOnlyStockPrice) {
        const existingImageSrcs = (existingProduct.images || []).map((img: any) => img.src.trim());
        const newImageSrcs = images.map((img: any) => img.src.trim());
        const imagesChanged = JSON.stringify(existingImageSrcs) !== JSON.stringify(newImageSrcs);

        if (imagesChanged && images.length > 0) {
          updateData.images = images;
          changes.push(`Görseller: ${existingImageSrcs.length} adet -> ${newImageSrcs.length} adet`);
        }
      }

      // Compare and merge attributes
      if (!syncOnlyStockPrice) {
        const existingAttrs = existingProduct.attributes || [];
        const updatedAttributes = [...existingAttrs];
        let attributesChanged = false;

        for (const attrMap of attrsMap) {
          let xmlVal = "";
          if (attrMap.xmlField === "__extract_gender__") {
            const nameVal = String(product[mapping.nameField] || "").toLowerCase();
            if (nameVal.includes("unisex")) {
              xmlVal = "Unisex";
            } else if (nameVal.includes("erkek")) {
              xmlVal = "Erkek";
            } else if (nameVal.includes("kadın") || nameVal.includes("kadin") || nameVal.includes("bayan")) {
              xmlVal = "Kadın";
            }
          } else {
            xmlVal = String(product[attrMap.xmlField] || "").trim();
          }

          if (!xmlVal || !attrMap.wooName) continue;

          const globalId = findGlobalAttributeId(attrMap.wooName);

          const existingAttrIdx = updatedAttributes.findIndex(
            (a: any) => (globalId > 0 && a.id === globalId) || a.name.toLowerCase() === attrMap.wooName.toLowerCase()
          );

          if (existingAttrIdx >= 0) {
            const existingAttr = updatedAttributes[existingAttrIdx];
            const existingVal = existingAttr.options?.[0] || "";
            const existingId = existingAttr.id ?? 0;
            if (existingVal !== xmlVal || existingAttr.visible !== attrMap.visible || existingId !== globalId) {
              updatedAttributes[existingAttrIdx] = {
                ...existingAttr,
                id: globalId,
                name: attrMap.wooName,
                visible: attrMap.visible,
                options: [xmlVal]
              };
              attributesChanged = true;
              changes.push(`Özellik (${attrMap.wooName}): "${existingVal}" -> "${xmlVal}" (ID: ${existingId} -> ${globalId})`);
            }
          } else {
            // Attribute doesn't exist on product, add it
            updatedAttributes.push({
              id: globalId,
              name: attrMap.wooName,
              visible: attrMap.visible,
              variation: false,
              options: [xmlVal]
            });
            attributesChanged = true;
            changes.push(`Özellik eklendi (${attrMap.wooName}): "${xmlVal}"`);
          }
        }

        if (attributesChanged) {
          updateData.attributes = updatedAttributes;
        }
      }

      // 2. Perform Update if there are changes
      if (changes.length > 0) {
        const updateUrl = `${baseUrl}/wp-json/wc/v3/products/${existingId}`;
        const updateResponse = await fetch(updateUrl, {
          method: "PUT",
          headers: {
            "Authorization": authHeader,
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify(updateData),
        });

        if (!updateResponse.ok) {
          const errText = await updateResponse.text();
          return NextResponse.json(
            { success: false, error: `WooCommerce güncelleme hatası (HTTP ${updateResponse.status}): ${errText}` },
            { status: 400 }
          );
        }

        const updatedData = await updateResponse.json();
        return NextResponse.json({
          success: true,
          status: "updated",
          sku,
          id: existingId,
          changes,
        });
      } else {
        // No changes needed
        return NextResponse.json({
          success: true,
          status: "skipped",
          sku,
          id: existingId,
          message: "Ürün güncel, değişiklik yok.",
        });
      }
    } else {
      // 3. Create Product if it does not exist
      const createUrl = `${baseUrl}/wp-json/wc/v3/products`;
      
      const attributes = attrsMap
        .map(am => {
          let val = "";
          if (am.xmlField === "__extract_gender__") {
            const nameVal = String(product[mapping.nameField] || "").toLowerCase();
            if (nameVal.includes("unisex")) {
              val = "Unisex";
            } else if (nameVal.includes("erkek")) {
              val = "Erkek";
            } else if (nameVal.includes("kadın") || nameVal.includes("kadin") || nameVal.includes("bayan")) {
              val = "Kadın";
            }
          } else {
            val = String(product[am.xmlField] || "").trim();
          }

          if (!val || !am.wooName) return null;
          const globalId = findGlobalAttributeId(am.wooName);
          return {
            id: globalId,
            name: am.wooName,
            visible: am.visible,
            variation: false,
            options: [val]
          };
        })
        .filter(Boolean);

      const createData = {
        name: name || `XML Ürünü - ${sku}`,
        sku,
        type: "simple",
        regular_price: price.toString(),
        description,
        manage_stock: true,
        stock_quantity: stock,
        stock_status: stock > 0 ? "instock" : "outofstock",
        images,
        attributes,
      };

      const createResponse = await fetch(createUrl, {
        method: "POST",
        headers: {
          "Authorization": authHeader,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(createData),
      });

      if (!createResponse.ok) {
        const errText = await createResponse.text();
        return NextResponse.json(
          { success: false, error: `WooCommerce oluşturma hatası (HTTP ${createResponse.status}): ${errText}` },
          { status: 400 }
        );
      }

      const createdData = await createResponse.json();
      return NextResponse.json({
        success: true,
        status: "created",
        sku,
        id: createdData.id,
      });
    }
  } catch (error: any) {
    console.error("Product Sync Error:", error);
    return NextResponse.json(
      { success: false, error: `Senkronizasyon hatası: ${error.message || error}` },
      { status: 500 }
    );
  }
}
