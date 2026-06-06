"use client";

import React, { useState } from "react";
import { Search, AlertTriangle, RefreshCw, ArrowRight } from "lucide-react";
import { useApp } from "../../context/AppContext";

export default function SearchPage() {
  const {
    wooUrl,
    consumerKey,
    consumerSecret,
    products,
    mapping,
    priceMultiplier,
    priceAddition,
    attributeMappings,
    addLog
  } = useApp();

  // Search local states
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchError, setSearchError] = useState("");
  const [singleSyncingSku, setSingleSyncingSku] = useState<string | null>(null);

  // Search and compare logic
  const handleSearchProducts = async () => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchError("Lütfen aramak için bir ürün adı veya SKU girin.");
      return;
    }

    if (products.length === 0) {
      setSearchError("Arama yapabilmek için önce XML verisini yüklemelisiniz (Senkronizasyon sayfasından).");
      return;
    }

    if (!wooUrl || !consumerKey || !consumerSecret) {
      setSearchError("WooCommerce API bağlantı bilgileri eksik. Lütfen Senkronizasyon sayfasından ayarlarınızı girip kaydedin.");
      return;
    }

    setIsSearching(true);
    setSearchError("");
    setSearchResults([]);

    try {
      // 1. Search locally in XML (Turkish locale-aware)
      const queryLower = query.toLocaleLowerCase('tr-TR');
      const matchedXml = products.filter(p => {
        const pName = String(p[mapping.nameField] || "").toLocaleLowerCase('tr-TR');
        const pSku = String(p[mapping.skuField] || "").toLocaleLowerCase('tr-TR');
        return pName.includes(queryLower) || pSku.includes(queryLower);
      });

      // 2. Search in WooCommerce via API
      const response = await fetch("/api/search-woo-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wooConfig: { url: wooUrl, consumerKey, consumerSecret },
          search: query
        })
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || "WooCommerce'de arama yapılamadı.");
      }

      const matchedWoo = data.products || [];

      // 3. Merge by SKU
      const allSkus = new Set<string>();
      matchedXml.forEach(p => {
        const sku = String(p[mapping.skuField] || "").trim();
        if (sku) allSkus.add(sku);
      });
      matchedWoo.forEach((p: any) => {
        const sku = String(p.sku || "").trim();
        if (sku) allSkus.add(sku);
      });

      const brandMapping = attributeMappings.find(am => am.wooName.toLowerCase() === "brand");
      const brandField = brandMapping?.xmlField || "Brand";

      const mergedResults = Array.from(allSkus).map(sku => {
        const xmlProd = matchedXml.find(p => String(p[mapping.skuField] || "").trim() === sku);
        const wooProd = matchedWoo.find((p: any) => String(p.sku || "").trim() === sku);

        let xmlPrice = 0;
        let xmlPriceCalculated = 0;
        let xmlStock = 0;
        let xmlName = "";
        let xmlBrand = "";

        if (xmlProd) {
          xmlName = String(xmlProd[mapping.nameField] || "").trim();
          xmlBrand = String(xmlProd[brandField] || "").trim();
          const priceStr = String(xmlProd[mapping.priceField] || "0").trim().replace(",", ".");
          xmlPrice = parseFloat(priceStr) || 0;
          const mult = parseFloat(priceMultiplier) || 1;
          const add = parseFloat(priceAddition) || 0;
          xmlPriceCalculated = Math.round((xmlPrice * mult + add) * 100) / 100;
          xmlStock = parseInt(xmlProd[mapping.stockField] || "0", 10) || 0;
        }

        const wooName = wooProd ? String(wooProd.name || "").trim() : "";
        const wooPrice = wooProd ? parseFloat(wooProd.regular_price || "0") : 0;
        const wooStock = wooProd ? (wooProd.stock_quantity ?? 0) : 0;

        const buyPriceMapping = attributeMappings.find(am => am.xmlField === mapping.priceField);
        const buyPriceWooName = buyPriceMapping ? buyPriceMapping.wooName : "BuyPrice";

        const wooBuyPriceAttr = wooProd?.attributes?.find(
          (a: any) => a.name.toLowerCase() === buyPriceWooName.toLowerCase()
        );
        const wooBuyPrice = wooBuyPriceAttr ? parseFloat(String(wooBuyPriceAttr.options?.[0] || "0").trim().replace(",", ".")) : 0;

        // Check differences
        const hasNameDiff = xmlProd && wooProd && xmlName !== wooName;
        const hasPriceDiff = xmlProd && wooProd && xmlPriceCalculated !== wooPrice;
        const hasBuyPriceDiff = xmlProd && wooProd && xmlPrice !== wooBuyPrice;
        const hasStockDiff = xmlProd && wooProd && xmlStock !== wooStock;

        return {
          sku,
          xmlProd,
          wooProd,
          xmlName,
          xmlBrand,
          xmlPrice,
          xmlPriceCalculated,
          xmlStock,
          wooName,
          wooPrice,
          wooStock,
          wooBuyPrice,
          hasNameDiff,
          hasPriceDiff,
          hasBuyPriceDiff,
          hasStockDiff,
          inXml: !!xmlProd,
          inWoo: !!wooProd
        };
      });

      setSearchResults(mergedResults);
      if (mergedResults.length === 0) {
        setSearchError("Aradığınız kriterlere uygun ürün bulunamadı.");
      }
    } catch (err: any) {
      console.error(err);
      setSearchError(`Arama hatası: ${err.message || err}`);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSyncSingleProduct = async (item: any) => {
    if (!item.xmlProd) {
      alert("Bu ürün XML'de bulunmadığı için senkronizasyon yapılamaz.");
      return;
    }

    setSingleSyncingSku(item.sku);
    addLog(`[Tekli Sync] SKU "${item.sku}" için senkronizasyon başlatıldı...`, "info");

    try {
      const response = await fetch("/api/sync-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wooConfig: { url: wooUrl, consumerKey, consumerSecret },
          product: item.xmlProd,
          mapping,
          priceMultiplier,
          priceAddition,
          attributeMappings
        })
      });

      const result = await response.json();
      if (result.success) {
        addLog(`[Tekli Sync] SKU "${item.sku}" başarıyla senkronize edildi.`, "success");
        await handleSearchProducts();
      } else {
        addLog(`[Tekli Sync] SKU "${item.sku}" senkronizasyon hatası: ${result.error}`, "error");
        alert(`Senkronizasyon hatası: ${result.error}`);
      }
    } catch (err: any) {
      addLog(`[Tekli Sync] SKU "${item.sku}" bağlantı hatası: ${err.message || err}`, "error");
      alert(`Bağlantı hatası: ${err.message || err}`);
    } finally {
      setSingleSyncingSku(null);
    }
  };

  return (
    <div className="app-container" style={{ padding: 0 }}>
      <header style={{ marginBottom: "2rem" }}>
        <h1 className="text-gradient" style={{ fontSize: "2.2rem", fontWeight: "800" }}>Ürün Arama & Karşılaştırma</h1>
        <p style={{ color: "var(--text-secondary)", marginTop: "0.25rem", fontSize: "0.95rem" }}>
          XML ve WooCommerce üzerindeki ürünlerin fiyat, stok ve isim verilerini canlı olarak sorgulayıp eşleştirin.
        </p>
      </header>

      <section className="glass-card">
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.25rem" }}>
          <Search size={20} style={{ color: "var(--accent-indigo)" }} />
          <h2 style={{ fontSize: "1.2rem" }}>XML ve WooCommerce Ürün Karşılaştırma & Sorgulama</h2>
        </div>
        
        <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "1.25rem" }}>
          XML'deki veya WooCommerce'deki herhangi bir ürünü başlığına ya da SKU koduna göre aratıp fiyat, stok ve diğer tüm verilerini yan yana canlı olarak karşılaştırabilirsiniz.
        </p>

        <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem" }}>
          <input 
            type="text" 
            className="form-input" 
            placeholder="Ürün adı veya SKU kodunu yazın... (Örn: SKU01)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearchProducts();
            }}
            style={{ flex: 1 }}
          />
          <button 
            className="btn btn-primary" 
            onClick={handleSearchProducts}
            disabled={isSearching}
            style={{ minWidth: "120px" }}
          >
            {isSearching ? (
              <RefreshCw size={16} style={{ animation: "spin 1s linear infinite" }} />
            ) : (
              <>
                <Search size={16} /> Ara
              </>
            )}
          </button>
        </div>

        {searchError && (
          <div style={{ 
            padding: "1rem", 
            background: "rgba(239, 68, 68, 0.08)", 
            border: "1px solid rgba(239, 68, 68, 0.25)", 
            borderRadius: "var(--radius-md)", 
            color: "var(--accent-danger)",
            fontSize: "0.85rem",
            marginBottom: "1.5rem",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem"
          }}>
            <AlertTriangle size={16} />
            <span>{searchError}</span>
          </div>
        )}

        {searchResults.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table className="compare-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border-color)", color: "var(--text-secondary)" }}>
                  <th style={{ padding: "0.75rem 0.5rem" }}>SKU / ÖZELLİK</th>
                  <th style={{ padding: "0.75rem 0.5rem" }}>XML DEĞERİ (HESAPLANAN)</th>
                  <th style={{ padding: "0.75rem 0.5rem", textAlign: "center" }}>KARŞILAŞTIRMA</th>
                  <th style={{ padding: "0.75rem 0.5rem" }}>WOOCOMMERCE DEĞERİ</th>
                  <th style={{ padding: "0.75rem 0.5rem", textAlign: "center" }}>AKSİYON</th>
                </tr>
              </thead>
              <tbody>
                {searchResults.map((item) => {
                  const isSynced = !item.hasNameDiff && !item.hasPriceDiff && !item.hasStockDiff && item.inXml && item.inWoo;
                  return (
                    <React.Fragment key={item.sku}>
                      {/* Header Row for Product SKU */}
                      <tr style={{ background: "rgba(255, 255, 255, 0.03)", borderTop: "1px solid var(--border-color)" }}>
                        <td colSpan={4} style={{ padding: "0.75rem 0.5rem", fontWeight: "700" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <span style={{ color: "var(--accent-indigo)" }}>{item.sku}</span>
                            {item.xmlBrand && <span className="badge badge-info" style={{ fontSize: "0.7rem", padding: "0.15rem 0.4rem" }}>{item.xmlBrand}</span>}
                            {!item.inXml && <span className="badge badge-danger" style={{ fontSize: "0.7rem", padding: "0.15rem 0.4rem" }}>XML'DE YOK</span>}
                            {!item.inWoo && <span className="badge badge-warning" style={{ fontSize: "0.7rem", padding: "0.15rem 0.4rem" }}>WOO'DA YOK</span>}
                            {isSynced && <span className="badge badge-success" style={{ fontSize: "0.7rem", padding: "0.15rem 0.4rem" }}>EŞİTLENMİŞ</span>}
                          </div>
                        </td>
                        <td style={{ padding: "0.5rem", textAlign: "center" }}>
                          {item.inXml && (
                            <button
                              className="btn btn-secondary"
                              style={{ 
                                padding: "0.25rem 0.6rem", 
                                fontSize: "0.75rem", 
                                borderColor: isSynced ? "var(--accent-success)" : "var(--accent-indigo)",
                                color: isSynced ? "var(--accent-success)" : "var(--text-primary)"
                              }}
                              onClick={() => handleSyncSingleProduct(item)}
                              disabled={singleSyncingSku === item.sku}
                            >
                              {singleSyncingSku === item.sku ? (
                                <RefreshCw size={12} style={{ animation: "spin 1s linear infinite" }} />
                              ) : isSynced ? (
                                "Yeniden Senkronize Et"
                              ) : (
                                "Şimdi Senkronize Et"
                              )}
                            </button>
                          )}
                        </td>
                      </tr>

                      {/* Name Comparison Row */}
                      {(item.inXml || item.inWoo) && (
                        <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.02)" }}>
                          <td style={{ color: "var(--text-secondary)", padding: "0.5rem 0.5rem 0.5rem 1.5rem" }}>Ürün Adı</td>
                          <td style={{ padding: "0.5rem", color: item.inXml ? "var(--text-primary)" : "var(--text-muted)" }}>
                            {item.xmlName || "-"}
                          </td>
                          <td style={{ padding: "0.5rem", textAlign: "center" }}>
                            {item.hasNameDiff ? (
                              <span style={{ color: "var(--accent-danger)", fontWeight: "600" }}>Farklı</span>
                            ) : (
                              <span style={{ color: "var(--text-muted)" }}>Aynı</span>
                            )}
                          </td>
                          <td style={{ padding: "0.5rem", color: item.inWoo ? "var(--text-primary)" : "var(--text-muted)" }}>
                            {item.wooName || "-"}
                          </td>
                          <td></td>
                        </tr>
                      )}

                      {/* BuyPrice Comparison Row */}
                      {(item.inXml || item.inWoo) && (
                        <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.02)" }}>
                          <td style={{ color: "var(--text-secondary)", padding: "0.5rem 0.5rem 0.5rem 1.5rem" }}>Alış Fiyatı (XML Ham)</td>
                          <td style={{ padding: "0.5rem", color: item.inXml ? "var(--text-primary)" : "var(--text-muted)" }}>
                            {item.inXml ? (
                              <span style={{ fontWeight: "600", color: "var(--text-primary)" }}>
                                {item.xmlPrice.toFixed(2)} TL
                              </span>
                            ) : "-"}
                          </td>
                          <td style={{ padding: "0.5rem", textAlign: "center" }}>
                            {item.hasBuyPriceDiff ? (
                              <span style={{ color: "var(--accent-warning)", fontWeight: "600" }}>Farklı</span>
                            ) : (
                              <span style={{ color: "var(--text-muted)" }}>Aynı</span>
                            )}
                          </td>
                          <td style={{ padding: "0.5rem", color: item.inWoo ? "var(--text-primary)" : "var(--text-muted)" }}>
                            {item.inWoo ? (
                              <span style={{ fontWeight: "600" }}>
                                {item.wooBuyPrice > 0 ? `${item.wooBuyPrice.toFixed(2)} TL` : "- (Nitelik Yok)"}
                              </span>
                            ) : "-"}
                          </td>
                          <td></td>
                        </tr>
                      )}

                      {/* Price Comparison Row */}
                      {(item.inXml || item.inWoo) && (
                        <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.02)" }}>
                          <td style={{ color: "var(--text-secondary)", padding: "0.5rem 0.5rem 0.5rem 1.5rem" }}>Satış Fiyatı (Katsayılı)</td>
                          <td style={{ padding: "0.5rem" }}>
                            {item.inXml ? (
                              <div>
                                <span style={{ fontWeight: "700", color: "var(--accent-success)" }}>
                                  {item.xmlPriceCalculated.toFixed(2)} TL
                                </span>
                                <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginLeft: "0.4rem" }}>
                                  (Ham × {priceMultiplier} + {priceAddition})
                                </span>
                              </div>
                            ) : "-"}
                          </td>
                          <td style={{ padding: "0.5rem", textAlign: "center" }}>
                            {item.hasPriceDiff ? (
                              <span style={{ color: "var(--accent-warning)", fontWeight: "600" }}>Farklı</span>
                            ) : (
                              <span style={{ color: "var(--text-muted)" }}>Aynı</span>
                            )}
                          </td>
                          <td style={{ padding: "0.5rem" }}>
                            {item.inWoo ? (
                              <span style={{ fontWeight: "700" }}>
                                {item.wooPrice.toFixed(2)} TL
                              </span>
                            ) : "-"}
                          </td>
                          <td></td>
                        </tr>
                      )}

                      {/* Stock Comparison Row */}
                      {(item.inXml || item.inWoo) && (
                        <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.02)" }}>
                          <td style={{ color: "var(--text-secondary)", padding: "0.5rem 0.5rem 0.5rem 1.5rem" }}>Stok Adedi</td>
                          <td style={{ padding: "0.5rem" }}>
                            {item.inXml ? (
                              <span style={{ fontWeight: "700", color: item.xmlStock > 0 ? "var(--accent-success)" : "var(--accent-danger)" }}>
                                {item.xmlStock} adet
                              </span>
                            ) : "-"}
                          </td>
                          <td style={{ padding: "0.5rem", textAlign: "center" }}>
                            {item.hasStockDiff ? (
                              <span style={{ color: "var(--accent-warning)", fontWeight: "600" }}>Farklı</span>
                            ) : (
                              <span style={{ color: "var(--text-muted)" }}>Aynı</span>
                            )}
                          </td>
                          <td style={{ padding: "0.5rem" }}>
                            {item.inWoo ? (
                              <span style={{ fontWeight: "700", color: item.wooStock > 0 ? "var(--accent-success)" : "var(--accent-danger)" }}>
                                {item.wooStock} adet
                              </span>
                            ) : "-"}
                          </td>
                          <td></td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
