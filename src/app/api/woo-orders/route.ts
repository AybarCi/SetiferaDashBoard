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
    baseUrl = baseUrl.replace(/\/+$/, ""); // Remove trailing slashes

    const authHeader = `Basic ${Buffer.from(`${wooConfig.consumerKey}:${wooConfig.consumerSecret}`).toString("base64")}`;

    // Query active orders (processing, pending) and bypass cache
    const ordersUrl = `${baseUrl}/wp-json/wc/v3/orders?status=processing,pending&per_page=50&_=${Date.now()}`;

    const response = await fetch(ordersUrl, {
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
        { success: false, error: `WooCommerce sipariş çekme hatası (HTTP ${response.status}): ${errText}` },
        { status: 400 }
      );
    }

    const orders = await response.json();
    return NextResponse.json({
      success: true,
      orders: Array.isArray(orders) ? orders : []
    });
  } catch (error: any) {
    console.error("Woo Orders Fetch Error:", error);
    return NextResponse.json(
      { success: false, error: `Siparişler çekilemedi: ${error.message || error}` },
      { status: 500 }
    );
  }
}
