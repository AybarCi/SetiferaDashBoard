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

    // Query WooCommerce orders reports totals
    const reportsUrl = `${baseUrl}/wp-json/wc/v3/reports/orders/totals?_=${Date.now()}`;

    const response = await fetch(reportsUrl, {
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
        { success: false, error: `WooCommerce rapor çekme hatası (HTTP ${response.status}): ${errText}` },
        { status: 400 }
      );
    }

    const reportTotals = await response.json();
    return NextResponse.json({
      success: true,
      totals: Array.isArray(reportTotals) ? reportTotals : []
    });
  } catch (error: any) {
    console.error("Woo Orders Report Fetch Error:", error);
    return NextResponse.json(
      { success: false, error: `Sipariş raporu çekilemedi: ${error.message || error}` },
      { status: 500 }
    );
  }
}
