import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { wooConfig, productId, policy } = body;

    if (!wooConfig || !wooConfig.url || !wooConfig.consumerKey || !wooConfig.consumerSecret) {
      return NextResponse.json(
        { success: false, error: "WooCommerce bağlantı bilgileri eksik." },
        { status: 400 }
      );
    }

    if (!productId || !policy) {
      return NextResponse.json(
        { success: false, error: "Ürün ID veya temizleme politikası eksik." },
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

    let targetUrl = `${baseUrl}/wp-json/wc/v3/products/${productId}`;
    let method = "POST";
    let requestBody: any = null;

    if (policy === "stock") {
      method = "PUT";
      requestBody = {
        manage_stock: true,
        stock_quantity: 0,
        stock_status: "outofstock"
      };
    } else if (policy === "trash") {
      method = "DELETE";
      // WooCommerce DELETE without force=true moves it to trash
    } else if (policy === "delete") {
      method = "DELETE";
      targetUrl = `${targetUrl}?force=true`; // Permanently delete
    } else {
      return NextResponse.json(
        { success: false, error: `Bilinmeyen temizlik politikası: ${policy}` },
        { status: 400 }
      );
    }

    const response = await fetch(targetUrl, {
      method,
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: requestBody ? JSON.stringify(requestBody) : undefined,
      next: { revalidate: 0 }
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json(
        { success: false, error: `WooCommerce temizlik API hatası (HTTP ${response.status}): ${errText}` },
        { status: 400 }
      );
    }

    const resData = await response.json();
    return NextResponse.json({
      success: true,
      productId,
      policy,
      status: policy === "stock" ? "updated_stock" : (policy === "trash" ? "trashed" : "deleted")
    });
  } catch (error: any) {
    console.error("Cleanup Product Error:", error);
    return NextResponse.json(
      { success: false, error: `Temizleme işlemi gerçekleştirilemedi: ${error.message || error}` },
      { status: 500 }
    );
  }
}
