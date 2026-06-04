import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { wooConfig, search } = body;

    if (!wooConfig || !wooConfig.url || !wooConfig.consumerKey || !wooConfig.consumerSecret) {
      return NextResponse.json(
        { success: false, error: "WooCommerce bağlantı bilgileri eksik." },
        { status: 400 }
      );
    }

    if (typeof search !== "string" || !search.trim()) {
      return NextResponse.json(
        { success: false, error: "Arama terimi eksik." },
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

    // Query WooCommerce REST API products endpoint with search parameter
    // per_page=50 is sufficient for search results, status=any to find all drafts/published
    const wooUrl = `${baseUrl}/wp-json/wc/v3/products?search=${encodeURIComponent(search.trim())}&per_page=50&status=any&_=${Date.now()}`;

    const response = await fetch(wooUrl, {
      method: "GET",
      headers: {
        "Authorization": authHeader,
        "Accept": "application/json",
      },
      cache: "no-store",
      next: { revalidate: 0 }
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json(
        { success: false, error: `WooCommerce arama hatası (HTTP ${response.status}): ${errText}` },
        { status: 400 }
      );
    }

    const products = await response.json();

    return NextResponse.json({
      success: true,
      products: Array.isArray(products) ? products : []
    });
  } catch (error: any) {
    console.error("Woo Search Fetch Error:", error);
    return NextResponse.json(
      { success: false, error: `WooCommerce ürün arama işlemi başarısız: ${error.message || error}` },
      { status: 500 }
    );
  }
}
