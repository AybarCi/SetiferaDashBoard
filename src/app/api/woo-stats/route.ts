import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { wooConfig } = body;

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
    baseUrl = baseUrl.replace(/\/+$/, "");

    const authHeader = `Basic ${Buffer.from(`${wooConfig.consumerKey}:${wooConfig.consumerSecret}`).toString("base64")}`;

    // 1. Fetch Top 10 Most Sold Products (Popularity is native in WC API)
    let popularProducts: any[] = [];
    try {
      const popUrl = `${baseUrl}/wp-json/wc/v3/products?orderby=popularity&order=desc&per_page=10&fields=id,sku,name,price,regular_price,stock_quantity,total_sales&_=${Date.now()}`;
      const popResponse = await fetch(popUrl, {
        method: "GET",
        headers: {
          "Authorization": authHeader,
          "Accept": "application/json",
        },
        cache: "no-store",
        next: { revalidate: 0 }
      });
      if (popResponse.ok) {
        popularProducts = await popResponse.json();
      }
    } catch (err) {
      console.error("Popular Products Fetch Error:", err);
    }

    // 2. Fetch Top 10 Most Viewed Products (Requires visit_count query parameters)
    let viewedProducts: any[] = [];
    let viewsTrackingActive = false;
    try {
      const viewUrl = `${baseUrl}/wp-json/wc/v3/products?orderby=visit_count&order=desc&per_page=10&_=${Date.now()}`;
      const viewResponse = await fetch(viewUrl, {
        method: "GET",
        headers: {
          "Authorization": authHeader,
          "Accept": "application/json",
        },
        cache: "no-store",
        next: { revalidate: 0 }
      });
      if (viewResponse.ok) {
        viewedProducts = await viewResponse.json();
        // Check if WooCommerce returned product objects containing the visit_count custom field
        const sample = viewedProducts[0];
        if (sample && typeof sample.visit_count !== "undefined") {
          viewsTrackingActive = true;
        } else {
          viewedProducts = []; // reset if not supported
        }
      }
    } catch (err) {
      console.error("Viewed Products Fetch Error:", err);
    }

    return NextResponse.json({
      success: true,
      popularProducts: Array.isArray(popularProducts) ? popularProducts : [],
      viewedProducts: Array.isArray(viewedProducts) ? viewedProducts : [],
      viewsTrackingActive
    });
  } catch (error: any) {
    console.error("Woo Stats Fetch Error:", error);
    return NextResponse.json(
      { success: false, error: `İstatistikler çekilemedi: ${error.message || error}` },
      { status: 500 }
    );
  }
}
