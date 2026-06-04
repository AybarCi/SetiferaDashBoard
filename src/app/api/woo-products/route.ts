import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { wooConfig, page = 1 } = body;

    if (!wooConfig || !wooConfig.url || !wooConfig.consumerKey || !wooConfig.consumerSecret) {
      return NextResponse.json(
        { success: false, error: "WooCommerce bağlantı bilgileri eksik." },
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

    // Query status=any to list all products, and append dynamic timestamp to bypass WordPress REST cache
    const wooUrl = `${baseUrl}/wp-json/wc/v3/products?page=${page}&per_page=100&status=any&fields=id,sku,name,stock_quantity&_=${Date.now()}`;

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
        { success: false, error: `WooCommerce ürün çekme hatası (HTTP ${response.status}): ${errText}` },
        { status: 400 }
      );
    }

    const products = await response.json();
    const totalPages = parseInt(response.headers.get("x-wp-totalpages") || "1", 10);
    const totalProducts = parseInt(response.headers.get("x-wp-total") || "0", 10);

    return NextResponse.json({
      success: true,
      products: Array.isArray(products) ? products : [],
      totalPages,
      totalProducts
    });
  } catch (error: any) {
    console.error("Woo Products Fetch Error:", error);
    return NextResponse.json(
      { success: false, error: `WooCommerce ürünleri çekilemedi: ${error.message || error}` },
      { status: 500 }
    );
  }
}
