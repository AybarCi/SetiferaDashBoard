import { NextRequest, NextResponse } from "next/server";
import { XMLParser } from "fast-xml-parser";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const xmlUrl = body.url || "https://cdn1.xmlbankasi.com/p1/hbnfefbamtze/image/data/xml/setifera.xml";

    // Append unique cache-busting query parameter to XML URL
    const finalUrl = xmlUrl + (xmlUrl.includes("?") ? "&" : "?") + `_=${Date.now()}`;

    const response = await fetch(finalUrl, {
      method: "GET",
      headers: {
        "Accept": "application/xml, text/xml, */*",
      },
      cache: "no-store",
      next: { revalidate: 0 } // Disable Next.js fetch caching to always get fresh data
    });

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: `XML dosyası indirilemedi (HTTP ${response.status})` },
        { status: 400 }
      );
    }

    const xmlText = await response.text();

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      parseTagValue: false, // Keep values as string to preserve barcode leading zeros and text formatting
      trimValues: true,
    });

    const parsedData = parser.parse(xmlText);

    // XML root tags vary. Let's find the products list dynamically or fall back to standard paths
    let products: any[] = [];
    
    // Look at common paths: Products.Product, products.product, etc.
    if (parsedData.Products && parsedData.Products.Product) {
      products = parsedData.Products.Product;
    } else if (parsedData.products && parsedData.products.product) {
      products = parsedData.products.product;
    } else {
      // Direct children search
      const keys = Object.keys(parsedData);
      if (keys.length > 0) {
        const root = parsedData[keys[0]];
        const firstChildKey = Object.keys(root).find(k => Array.isArray(root[k]) || typeof root[k] === 'object');
        if (firstChildKey) {
          products = root[firstChildKey];
        }
      }
    }

    // Normalize: if there is only 1 product, fast-xml-parser makes it an object instead of an array
    if (products && !Array.isArray(products)) {
      products = [products];
    }

    if (!products || products.length === 0) {
      return NextResponse.json(
        { success: false, error: "XML içerisinde ürün bulunamadı. Yapı geçersiz olabilir." },
        { status: 400 }
      );
    }

    // Sample object to show key/value template
    const sampleProduct = products[0];

    return NextResponse.json({
      success: true,
      total: products.length,
      sample: sampleProduct,
      products: products
    });
  } catch (error: any) {
    console.error("XML Parse Error:", error);
    return NextResponse.json(
      { success: false, error: `Hata oluştu: ${error.message || error}` },
      { status: 500 }
    );
  }
}
