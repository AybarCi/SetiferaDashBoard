"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Settings, 
  Database, 
  RefreshCw, 
  Play, 
  Pause, 
  RotateCcw, 
  CheckCircle, 
  AlertTriangle, 
  FileText, 
  ArrowRight,
  Plus,
  Trash2,
  Terminal,
  Activity
} from "lucide-react";
import { useApp, MappingConfig, AttributeMapping } from "../context/AppContext";

export default function Home() {
  const {
    wooUrl, setWooUrl,
    consumerKey, setConsumerKey,
    consumerSecret, setConsumerSecret,
    xmlUrl, setXmlUrl,
    products, setProducts,
    sampleProduct, setSampleProduct,
    xmlKeys, setXmlKeys,
    mapping, setMapping,
    priceMultiplier, setPriceMultiplier,
    priceAddition, setPriceAddition,
    attributeMappings, setAttributeMappings,
    excludedBrands, setExcludedBrands,
    fastSync, setFastSync,
    syncOnlyStockPrice, setSyncOnlyStockPrice,
    concurrency, setConcurrency,
    isSyncing,
    isPaused, setIsPaused,
    currentIndex,
    stats,
    logs, setLogs,
    isPreloadingWoo, preloadStatus,
    addLog, saveWooSettings,
    startSync, pauseSync, resetSync
  } = useApp();

  // XML Page Local States
  const [isLoadingXml, setIsLoadingXml] = useState(false);

  // Cleanup States (kept local to page since they only run on the main dashboard)
  const [cleanupPolicy, setCleanupPolicy] = useState("none");
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanupPage, setCleanupPage] = useState(1);
  const [cleanupTotalPages, setCleanupTotalPages] = useState(1);
  const [cleanupStats, setCleanupStats] = useState({ scanned: 0, updated: 0, errors: 0 });
  const cleanupStatsRef = useRef({ scanned: 0, updated: 0, errors: 0 });
  const consoleRef = useRef<HTMLDivElement>(null);

  // Load cleanup policy from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedCleanupPolicy = localStorage.getItem("cleanup_policy") || "none";
      setCleanupPolicy(storedCleanupPolicy);
    }
  }, []);

  // Auto-scroll logs console to bottom
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [logs]);

  // Fetch and Parse XML
  const handleLoadXml = async () => {
    if (!xmlUrl.trim()) {
      addLog("Lütfen geçerli bir XML URL adresi girin.", "error");
      return;
    }

    setIsLoadingXml(true);
    addLog(`XML verileri çekiliyor: ${xmlUrl}`, "info");

    try {
      const response = await fetch("/api/xml", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: xmlUrl })
      });

      const data = await response.json();

      if (data.success) {
        setProducts(data.products);
        setSampleProduct(data.sample);
        
        const keys = Object.keys(data.sample);
        setXmlKeys(keys);

        addLog(`XML başarıyla okundu. Toplam ürün adedi: ${data.total}`, "success");

        const existingMapping = localStorage.getItem("mapping_config");
        if (!existingMapping) {
          const sku = keys.find(k => k.toLowerCase() === "product_code" || k.toLowerCase() === "product_id" || k.toLowerCase() === "sku" || k.toLowerCase() === "barcode") || "";
          const name = keys.find(k => k.toLowerCase() === "name" || k.toLowerCase() === "title" || k.toLowerCase() === "urun_adi") || "";
          const price = keys.find(k => k.toLowerCase() === "price" || k.toLowerCase() === "fiyat") || "";
          const stock = keys.find(k => k.toLowerCase() === "stock" || k.toLowerCase() === "stok" || k.toLowerCase() === "quantity" || k.toLowerCase() === "adet") || "";
          const desc = keys.find(k => k.toLowerCase() === "description" || k.toLowerCase() === "aciklama" || k.toLowerCase() === "detay") || "";
          const imgs = keys.filter(k => k.toLowerCase().includes("image") || k.toLowerCase().includes("resim"));

          const newMapping: MappingConfig = {
            skuField: sku,
            nameField: name,
            priceField: price,
            stockField: stock,
            descriptionField: desc,
            imageFields: imgs.slice(0, 5)
          };

          setMapping(newMapping);
          addLog("Otomatik alan eşleştirmeleri tamamlandı. Lütfen kontrol edin.", "info");
        }
      } else {
        addLog(`XML ayrıştırma başarısız: ${data.error}`, "error");
      }
    } catch (error: any) {
      addLog(`XML bağlantı hatası: ${error.message || error}`, "error");
    } finally {
      setIsLoadingXml(false);
    }
  };

  // Cleanup Loop Engine controlled via React useEffect
  useEffect(() => {
    if (!isCleaning || isPaused) {
      return;
    }

    let isRequestActive = true;

    const cleanupStep = async () => {
      const pagesLabel = cleanupTotalPages > 1 ? `/ ${cleanupTotalPages}` : "";
      addLog(`[Temizlik] WooCommerce ürünleri taranıyor... Sayfa ${cleanupPage} ${pagesLabel}`, "info");

      try {
        const response = await fetch("/api/woo-products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wooConfig: { url: wooUrl, consumerKey, consumerSecret },
            page: cleanupPage
          })
        });

        if (!isRequestActive) return;

        const data = await response.json();

        if (data.success) {
          if (cleanupPage === 1 && data.totalPages) {
            setCleanupTotalPages(data.totalPages);
          }

          const wooProducts = data.products || [];
          
          if (wooProducts.length === 0) {
            setIsCleaning(false);
            const stats = cleanupStatsRef.current;
            addLog(`Temizlik işlemi tamamlandı! Toplam Taranan Ürün: ${stats.scanned}, Temizlenen/Güncellenen: ${stats.updated}, Hata: ${stats.errors}`, "success");
            return;
          }

          const brandMapping = attributeMappings.find(am => am.wooName.toLowerCase() === "brand");
          const brandField = brandMapping?.xmlField || "Brand";

          const xmlSkus = new Set(products.map(p => String(p[mapping.skuField] || "").trim().toLowerCase()));
          const xmlSkuToBrand = new Map(products.map(p => [
            String(p[mapping.skuField] || "").trim().toLowerCase(),
            String(p[brandField] || "").trim()
          ]));

          let processedCount = 0;
          let actionCount = 0;
          let errorCount = 0;

          for (const wooProd of wooProducts) {
            const wooSku = String(wooProd.sku || "").trim();
            if (!wooSku) continue;

            const wooSkuLower = wooSku.toLowerCase();
            processedCount++;

            const isMissingFromXml = !xmlSkus.has(wooSkuLower);
            const xmlBrand = xmlSkuToBrand.get(wooSkuLower) || "";
            const isBrandExcluded = xmlSkus.has(wooSkuLower) && xmlBrand && excludedBrands.includes(xmlBrand);

            if (isMissingFromXml || isBrandExcluded) {
              const policyLabel = cleanupPolicy === "stock" ? "Stok Sıfırla" : (cleanupPolicy === "trash" ? "Çöpe At" : "Kalıcı Sil");
              const reason = isMissingFromXml ? "XML'de yok" : `Engellenen "${xmlBrand}" markasına ait`;
              
              addLog(`[Temizlik] WooCommerce'deki SKU "${wooSku}" ${reason}. İşlem: ${policyLabel}...`, "warning");

              try {
                const cleanupRes = await fetch("/api/cleanup-product", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    wooConfig: { url: wooUrl, consumerKey, consumerSecret },
                    productId: wooProd.id,
                    policy: cleanupPolicy
                  })
                });
                const cleanupData = await cleanupRes.json();
                if (cleanupData.success) {
                  actionCount++;
                  addLog(`[Temizlik] SKU "${wooSku}" başarıyla temizlendi (${reason}).`, "success");
                } else {
                  errorCount++;
                  addLog(`[Temizlik] SKU "${wooSku}" temizlik hatası: ${cleanupData.error}`, "error");
                }
              } catch (e: any) {
                errorCount++;
                addLog(`[Temizlik] SKU "${wooSku}" bağlantı hatası: ${e.message || e}`, "error");
              }
            }
          }

          cleanupStatsRef.current = {
            scanned: cleanupStatsRef.current.scanned + processedCount,
            updated: cleanupStatsRef.current.updated + actionCount,
            errors: cleanupStatsRef.current.errors + errorCount
          };
          setCleanupStats({ ...cleanupStatsRef.current });

          setCleanupPage(prev => prev + 1);
        } else {
          addLog(`[Temizlik] WooCommerce ürün listesi çekilemedi: ${data.error}`, "error");
          setIsCleaning(false);
        }
      } catch (err: any) {
        if (!isRequestActive) return;
        addLog(`[Temizlik] Bağlantı hatası: ${err.message || err}`, "error");
        setIsCleaning(false);
      }
    };

    const timeoutId = setTimeout(cleanupStep, 100);

    return () => {
      isRequestActive = false;
      clearTimeout(timeoutId);
    };
  }, [isCleaning, isPaused, cleanupPage, cleanupTotalPages, products, mapping, wooUrl, consumerKey, consumerSecret, cleanupPolicy, excludedBrands, attributeMappings]);

  // Clean-up controls
  const handleStartCleanup = () => {
    if (!wooUrl || !consumerKey || !consumerSecret) {
      addLog("Lütfen WooCommerce API bağlantı ayarlarını girin ve kaydedin.", "error");
      return;
    }
    if (products.length === 0) {
      addLog("Temizliğe başlamadan önce XML dosyasını yüklemelisiniz.", "error");
      return;
    }
    if (cleanupPolicy === "none") {
      addLog("Lütfen geçerli bir temizleme politikası seçin.", "error");
      return;
    }

    setIsCleaning(true);
    setCleanupPage(1);
    setCleanupTotalPages(1);
    setCleanupStats({ scanned: 0, updated: 0, errors: 0 });
    cleanupStatsRef.current = { scanned: 0, updated: 0, errors: 0 };
    addLog("WooCommerce üzerinde XML dışı ürün temizleme taraması başlatıldı...", "warning");
  };

  const handleResetSync = () => {
    resetSync();
    setCleanupPage(1);
    setCleanupTotalPages(1);
    setCleanupStats({ scanned: 0, updated: 0, errors: 0 });
    cleanupStatsRef.current = { scanned: 0, updated: 0, errors: 0 };
  };

  // Mapping Helpers
  const handleMappingChange = (field: keyof MappingConfig, value: string) => {
    setMapping(prev => ({ ...prev, [field]: value }));
  };

  const addImageField = () => {
    setMapping(prev => ({ ...prev, imageFields: [...prev.imageFields, ""] }));
  };

  const removeImageField = (index: number) => {
    setMapping(prev => {
      const updated = [...prev.imageFields];
      updated.splice(index, 1);
      return { ...prev, imageFields: updated };
    });
  };

  const updateImageField = (index: number, value: string) => {
    setMapping(prev => {
      const updated = [...prev.imageFields];
      updated[index] = value;
      return { ...prev, imageFields: updated };
    });
  };

  const progressPercent = products.length > 0 ? Math.round((stats.processed / products.length) * 100) : 0;

  return (
    <div className="app-container" style={{ padding: 0 }}>
      {/* Title Header */}
      <header style={{ marginBottom: "2rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 className="text-gradient" style={{ fontSize: "2.2rem", fontWeight: "800" }}>Setifera WooCommerce Sync</h1>
          <p style={{ color: "var(--text-secondary)", marginTop: "0.25rem", fontSize: "0.95rem" }}>
            XML verilerini WooCommerce e-ticaret sitenize anlık olarak eşleştirin ve senkronize edin.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          {isSyncing ? (
            <span className="badge badge-info pulse" style={{ padding: "0.5rem 0.8rem", gap: "0.4rem" }}>
              <Activity size={14} style={{ animation: "spin 3s linear infinite" }} />
              {isPaused ? "DURAKLATILDI" : "SENKRONİZE EDİLİYOR"}
            </span>
          ) : (
            <span className="badge badge-success" style={{ padding: "0.5rem 0.8rem", gap: "0.4rem" }}>
              <CheckCircle size={14} />
              BAĞLANTI HAZIR
            </span>
          )}
        </div>
      </header>

      {/* Grid: Settings Panel */}
      <div className="dashboard-grid" style={{ marginBottom: "1.5rem" }}>
        {/* WooCommerce Setup */}
        <section className="glass-card">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.25rem" }}>
            <Settings size={20} style={{ color: "var(--accent-indigo)" }} />
            <h2 style={{ fontSize: "1.2rem" }}>1. WooCommerce API Ayarları</h2>
          </div>
          
          <div className="form-group">
            <label className="form-label">Sitenizin Web Adresi (URL)</label>
            <input 
              type="text" 
              className="form-input" 
              placeholder="https://siteniz.com"
              value={wooUrl}
              onChange={(e) => setWooUrl(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Consumer Key (Müşteri Anahtarı)</label>
            <input 
              type="text" 
              className="form-input" 
              placeholder="ck_..."
              value={consumerKey}
              onChange={(e) => setConsumerKey(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Consumer Secret (Müşteri Parolası)</label>
            <input 
              type="password" 
              className="form-input" 
              placeholder="cs_..."
              value={consumerSecret}
              onChange={(e) => setConsumerSecret(e.target.value)}
            />
          </div>

          <button className="btn btn-secondary" style={{ width: "100%" }} onClick={saveWooSettings}>
            Bağlantıyı Kaydet
          </button>
        </section>

        {/* XML Setup */}
        <section className="glass-card">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.25rem" }}>
            <Database size={20} style={{ color: "var(--accent-purple)" }} />
            <h2 style={{ fontSize: "1.2rem" }}>2. XML Ürün Kaynak Ayarları</h2>
          </div>

          <div className="form-group" style={{ marginBottom: "1.75rem" }}>
            <label className="form-label">XML Dosyası URL Adresi</label>
            <input 
              type="text" 
              className="form-input" 
              placeholder="https://example.com/products.xml"
              value={xmlUrl}
              onChange={(e) => setXmlUrl(e.target.value)}
            />
          </div>

          <div style={{ minHeight: "100px", padding: "1rem", background: "rgba(0,0,0,0.2)", borderRadius: "var(--radius-md)", border: "1px dashed var(--border-color)", marginBottom: "1.25rem", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
            {products.length > 0 ? (
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: "1.2rem", fontWeight: "700", color: "var(--accent-success)" }}>
                  {products.length.toLocaleString()} Ürün
                </p>
                <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                  XML Dosyası başarıyla indirildi ve okundu.
                </p>
              </div>
            ) : (
              <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                <p>XML yüklendiğinde toplam ürün adedi burada görüntülenecektir.</p>
              </div>
            )}
          </div>

          <button 
            className="btn btn-primary" 
            style={{ width: "100%" }} 
            onClick={handleLoadXml}
            disabled={isLoadingXml}
          >
            {isLoadingXml ? (
              <>
                <RefreshCw size={16} style={{ animation: "spin 1s linear infinite" }} />
                XML Çekiliyor...
              </>
            ) : (
              <>
                <RefreshCw size={16} />
                XML Yükle ve Şablon Çıkar
              </>
            )}
          </button>
        </section>
      </div>

      {/* Grid: Mapping & Configuration */}
      {products.length > 0 && sampleProduct && (
        <div className="dashboard-grid" style={{ marginBottom: "1.5rem" }}>
          {/* XML Template Preview */}
          <section className="glass-card">
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
              <FileText size={20} style={{ color: "var(--accent-indigo)" }} />
              <h2 style={{ fontSize: "1.2rem" }}>3. XML Ürün Şablonu</h2>
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "1rem" }}>
              XML dosyanızdan çekilen ilk ürünün veri yapısı:
            </p>

            <div className="xml-tree">
              <div style={{ color: "var(--text-muted)", marginBottom: "0.5rem" }}>&lt;Product&gt;</div>
              {xmlKeys.map(key => {
                const val = sampleProduct[key];
                const isShort = typeof val === "string" && val.length < 60;
                return (
                  <div key={key} style={{ paddingLeft: "1.25rem", margin: "0.25rem 0", display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
                    <span className="xml-tag">&lt;</span>
                    <span className="xml-key">{key}</span>
                    <span className="xml-tag">&gt;</span>
                    <span className="xml-val" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: isShort ? "nowrap" : "normal" }}>
                      {isShort ? String(val) : String(val).substring(0, 60) + "..."}
                    </span>
                    <span className="xml-tag">&lt;/</span>
                    <span className="xml-key">{key}</span>
                    <span className="xml-tag">&gt;</span>
                  </div>
                );
              })}
              <div style={{ color: "var(--text-muted)", marginTop: "0.5rem" }}>&lt;/Product&gt;</div>
            </div>
          </section>

          {/* WooCommerce Mapping Controls */}
          <section className="glass-card">
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
              <Settings size={20} style={{ color: "var(--accent-purple)" }} />
              <h2 style={{ fontSize: "1.2rem" }}>4. WooCommerce Alan Eşleştirmesi</h2>
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div className="mapping-row">
                <span className="mapping-dest-label">SKU (Ürün Kodu) *</span>
                <ArrowRight size={14} style={{ color: "var(--text-muted)" }} />
                <select className="form-select" value={mapping.skuField} onChange={(e) => handleMappingChange("skuField", e.target.value)}>
                  <option value="">-- XML Alanı Seçin --</option>
                  {xmlKeys.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>

              <div className="mapping-row">
                <span className="mapping-dest-label">Ürün Adı *</span>
                <ArrowRight size={14} style={{ color: "var(--text-muted)" }} />
                <select className="form-select" value={mapping.nameField} onChange={(e) => handleMappingChange("nameField", e.target.value)}>
                  <option value="">-- XML Alanı Seçin --</option>
                  {xmlKeys.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>

              <div className="mapping-row">
                <span className="mapping-dest-label">Satış Fiyatı *</span>
                <ArrowRight size={14} style={{ color: "var(--text-muted)" }} />
                <select className="form-select" value={mapping.priceField} onChange={(e) => handleMappingChange("priceField", e.target.value)}>
                  <option value="">-- XML Alanı Seçin --</option>
                  {xmlKeys.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>

              <div className="mapping-row">
                <span className="mapping-dest-label">Stok Adedi *</span>
                <ArrowRight size={14} style={{ color: "var(--text-muted)" }} />
                <select className="form-select" value={mapping.stockField} onChange={(e) => handleMappingChange("stockField", e.target.value)}>
                  <option value="">-- XML Alanı Seçin --</option>
                  {xmlKeys.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>

              <div className="mapping-row">
                <span className="mapping-dest-label">Açıklama (Detay)</span>
                <ArrowRight size={14} style={{ color: "var(--text-muted)" }} />
                <select className="form-select" value={mapping.descriptionField} onChange={(e) => handleMappingChange("descriptionField", e.target.value)}>
                  <option value="">-- Eşleştirmeyi Atla --</option>
                  {xmlKeys.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>

              {/* Dynamic Images */}
              <div style={{ marginTop: "0.5rem", borderTop: "1px solid var(--border-color)", paddingTop: "0.75rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <label className="form-label" style={{ margin: 0 }}>Görsel URL Alanları</label>
                  <button className="btn btn-secondary" style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }} onClick={addImageField}>
                    <Plus size={12} /> Görsel Ekle
                  </button>
                </div>

                {mapping.imageFields.map((imageField, idx) => (
                  <div key={idx} className="mapping-row" style={{ marginTop: "0.4rem" }}>
                    <span className="mapping-dest-label" style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Görsel #{idx + 1}</span>
                    <ArrowRight size={14} style={{ color: "var(--text-muted)" }} />
                    <div style={{ display: "flex", gap: "0.5rem", width: "100%" }}>
                      <select className="form-select" value={imageField} onChange={(e) => updateImageField(idx, e.target.value)}>
                        <option value="">-- XML Alanı --</option>
                        {xmlKeys.map(k => <option key={k} value={k}>{k}</option>)}
                      </select>
                      <button className="btn btn-danger" style={{ padding: "0.5rem" }} onClick={() => removeImageField(idx)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Price Calculation Formulas */}
              <div style={{ marginTop: "1rem", borderTop: "1px solid var(--border-color)", paddingTop: "1rem" }}>
                <label className="form-label" style={{ fontWeight: "600", color: "var(--accent-indigo)", marginBottom: "0.5rem" }}>Fiyat Formülü Ayarları (Kâr Oranı)</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
                  <div>
                    <label className="form-label" style={{ fontSize: "0.75rem" }}>Fiyat Çarpanı (Katsayı)</label>
                    <input type="number" step="0.01" min="0" className="form-input" value={priceMultiplier} onChange={(e) => setPriceMultiplier(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label" style={{ fontSize: "0.75rem" }}>Sabit Artış Tutarı</label>
                    <input type="number" step="1" min="0" className="form-input" value={priceAddition} onChange={(e) => setPriceAddition(e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Attributes mapping */}
              <div style={{ marginTop: "1rem", borderTop: "1px solid var(--border-color)", paddingTop: "1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <label className="form-label" style={{ fontWeight: "600", color: "var(--accent-purple)", margin: 0 }}>Nitelik Eşleştirmeleri (Attributes)</label>
                  <button className="btn btn-secondary" style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }} onClick={() => setAttributeMappings(prev => [...prev, { wooName: "", xmlField: "", visible: false }])}>
                    <Plus size={12} /> Nitelik Ekle
                  </button>
                </div>
                {attributeMappings.map((attr, idx) => (
                  <div key={idx} style={{ background: "rgba(0,0,0,0.15)", padding: "0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)", marginBottom: "0.5rem" }}>
                    <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                      <input type="text" className="form-input" placeholder="Nitelik Adı (Örn: Brand)" value={attr.wooName} onChange={(e) => {
                        const updated = [...attributeMappings];
                        updated[idx].wooName = e.target.value;
                        setAttributeMappings(updated);
                      }} style={{ flex: 1 }} />
                      <select className="form-select" value={attr.xmlField} onChange={(e) => {
                        const updated = [...attributeMappings];
                        updated[idx].xmlField = e.target.value;
                        setAttributeMappings(updated);
                      }} style={{ flex: 1 }}>
                        <option value="">-- XML Alanı Seçin --</option>
                        <option value="__extract_gender__" style={{ color: "var(--accent-indigo)", fontWeight: "600" }}>⚡ İsimden Cinsiyet Ayıkla</option>
                        {xmlKeys.map(k => <option key={k} value={k}>{k}</option>)}
                      </select>
                      <button className="btn btn-danger" style={{ padding: "0.5rem" }} onClick={() => {
                        const updated = [...attributeMappings];
                        updated.splice(idx, 1);
                        setAttributeMappings(updated);
                      }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <input type="checkbox" id={`attr-visible-${idx}`} checked={attr.visible} onChange={(e) => {
                        const updated = [...attributeMappings];
                        updated[idx].visible = e.target.checked;
                        setAttributeMappings(updated);
                      }} style={{ cursor: "pointer", width: "14px", height: "14px" }} />
                      <label htmlFor={`attr-visible-${idx}`} style={{ fontSize: "0.75rem", color: "var(--text-secondary)", cursor: "pointer", userSelect: "none" }}>Ürün sayfasında nitelik tablosunda gösterilsin</label>
                    </div>
                  </div>
                ))}
              </div>

              {/* Brand Filter */}
              <div style={{ marginTop: "1rem", borderTop: "1px solid var(--border-color)", paddingTop: "1rem" }}>
                <label className="form-label" style={{ fontWeight: "600", color: "var(--accent-warning)", marginBottom: "0.5rem" }}>Marka Filtreleme ve Engelleme</label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "0.5rem", maxHeight: "150px", overflowY: "auto", padding: "0.5rem", background: "rgba(0,0,0,0.15)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}>
                  {Array.from(new Set(products.map(p => {
                    const brandMapping = attributeMappings.find(am => am.wooName.toLowerCase() === "brand");
                    const brandField = brandMapping?.xmlField || "Brand";
                    return String(p[brandField] || "").trim();
                  }).filter(Boolean))).sort().map(brand => {
                    const isExcluded = excludedBrands.includes(brand);
                    return (
                      <div key={brand} style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }} onClick={() => {
                        if (isExcluded) {
                          setExcludedBrands(prev => prev.filter(b => b !== brand));
                        } else {
                          setExcludedBrands(prev => [...prev, brand]);
                        }
                      }}>
                        <input type="checkbox" checked={isExcluded} readOnly style={{ cursor: "pointer", width: "13px", height: "13px" }} />
                        <span style={{ fontSize: "0.75rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: isExcluded ? "var(--accent-danger)" : "var(--text-primary)", fontWeight: isExcluded ? "600" : "400" }} title={brand}>
                          {brand}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Sync speed options */}
              <div style={{ marginTop: "1rem", borderTop: "1px solid var(--border-color)", paddingTop: "1rem" }}>
                <label className="form-label" style={{ fontWeight: "600", color: "var(--accent-indigo)", marginBottom: "0.5rem" }}>Senkronizasyon Seçenekleri & Hız Ayarları</label>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginBottom: "0.75rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <input type="checkbox" id="sync-fast" checked={fastSync} onChange={(e) => setFastSync(e.target.checked)} style={{ cursor: "pointer", width: "14px", height: "14px" }} />
                    <label htmlFor="sync-fast" style={{ fontSize: "0.75rem", color: "var(--text-primary)", cursor: "pointer", userSelect: "none" }}>
                      <strong>Hızlı Senkronizasyon</strong> (Değişmeyen ürünleri atlar)
                    </label>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <input type="checkbox" id="sync-only-stock-price" checked={syncOnlyStockPrice} onChange={(e) => setSyncOnlyStockPrice(e.target.checked)} style={{ cursor: "pointer", width: "14px", height: "14px" }} />
                    <label htmlFor="sync-only-stock-price" style={{ fontSize: "0.75rem", color: "var(--text-primary)", cursor: "pointer", userSelect: "none" }}>
                      <strong>Sadece Stok ve Fiyat Güncelle</strong> (Açıklamaları ve görselleri ezmez)
                    </label>
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: "0.75rem" }}>Eş Zamanlı İstek Sayısı (Hız)</label>
                  <select className="form-select" value={concurrency} onChange={(e) => setConcurrency(parseInt(e.target.value, 10))}>
                    <option value="1">1 (En Güvenli / Yavaş)</option>
                    <option value="3">3 (Normal)</option>
                    <option value="5">5 (Hızlı)</option>
                    <option value="10">10 (Çok Hızlı / Riskli)</option>
                  </select>
                </div>
              </div>

              {/* Cleanup section */}
              <div style={{ marginTop: "1rem", borderTop: "1px solid var(--border-color)", paddingTop: "1rem" }}>
                <label className="form-label" style={{ fontWeight: "600", color: "var(--accent-purple)", marginBottom: "0.5rem" }}>XML Dışı Ürün Ayarları (Temizlik)</label>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: "0.75rem" }}>Temizleme Politikası</label>
                  <select className="form-select" value={cleanupPolicy} onChange={(e) => setCleanupPolicy(e.target.value)}>
                    <option value="none">Yok (Eski Ürünleri Atla)</option>
                    <option value="stock">Stok Sıfırla (Out of Stock Yap)</option>
                    <option value="trash">Çöpe At (WooCommerce Çöp Kutusu)</option>
                    <option value="delete">Kalıcı Olarak Sil</option>
                  </select>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Sync Console */}
      {products.length > 0 && (
        <section className="glass-card pulse-card" style={{ padding: "1.75rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.25rem" }}>
            <Activity size={20} style={{ color: "var(--accent-indigo)" }} />
            <h2 style={{ fontSize: "1.2rem" }}>5. Senkronizasyon Konsolu ve Yönetimi</h2>
          </div>

          <div className="dashboard-grid">
            {/* Stats */}
            <div>
              <div className="stat-grid">
                <div className="stat-card">
                  <div style={{ color: "var(--text-secondary)", fontSize: "0.75rem", fontWeight: "600" }}>TOPLAM</div>
                  <div className="stat-val" style={{ color: "var(--text-primary)" }}>{products.length}</div>
                </div>
                <div className="stat-card">
                  <div style={{ color: "var(--text-secondary)", fontSize: "0.75rem", fontWeight: "600" }}>İŞLENEN</div>
                  <div className="stat-val" style={{ color: "var(--accent-info)" }}>{stats.processed}</div>
                </div>
                <div className="stat-card">
                  <div style={{ color: "var(--accent-success)", fontSize: "0.75rem", fontWeight: "600" }}>EKLENEN</div>
                  <div className="stat-val" style={{ color: "var(--accent-success)" }}>{stats.created}</div>
                </div>
                <div className="stat-card">
                  <div style={{ color: "var(--accent-warning)", fontSize: "0.75rem", fontWeight: "600" }}>GÜNCEL</div>
                  <div className="stat-val" style={{ color: "var(--accent-warning)" }}>{stats.updated}</div>
                </div>
                <div className="stat-card">
                  <div style={{ color: "var(--text-muted)", fontSize: "0.75rem", fontWeight: "600" }}>ATLANAN</div>
                  <div className="stat-val" style={{ color: "var(--text-muted)" }}>{stats.skipped}</div>
                </div>
                <div className="stat-card">
                  <div style={{ color: "var(--accent-danger)", fontSize: "0.75rem", fontWeight: "600" }}>HATA</div>
                  <div className="stat-val" style={{ color: "var(--accent-danger)" }}>{stats.error}</div>
                </div>
              </div>

              {/* Preload Status Banner */}
              {isPreloadingWoo && (
                <div style={{ marginBottom: "1rem", padding: "0.85rem", background: "rgba(59, 130, 246, 0.08)", border: "1px solid rgba(59, 130, 246, 0.25)", borderRadius: "var(--radius-md)", fontSize: "0.8rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <RefreshCw size={14} style={{ animation: "spin 1s linear infinite", color: "var(--accent-indigo)" }} />
                    <span style={{ fontWeight: "600", color: "var(--text-primary)" }}>{preloadStatus}</span>
                  </div>
                </div>
              )}

              {/* Progress Bar */}
              <div className="progress-wrapper">
                <div className="progress-header">
                  <span>Senkronizasyon Durumu</span>
                  <span>%{progressPercent} ({stats.processed} / {products.length})</span>
                </div>
                <div className="progress-bar-bg">
                  <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }}></div>
                </div>
              </div>

              {/* Cleanup Status */}
              {(isCleaning || cleanupStats.scanned > 0) && (
                <div style={{ marginBottom: "1.5rem", padding: "0.85rem", background: "rgba(168, 85, 247, 0.08)", border: "1px solid rgba(168, 85, 247, 0.25)", borderRadius: "var(--radius-md)", fontSize: "0.8rem" }}>
                  <div style={{ display: "flex", justifySelf: "space-between", fontWeight: "600", marginBottom: "0.5rem" }}>
                    <span style={{ color: "var(--accent-purple)", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <Activity size={12} className={isCleaning ? "pulse" : ""} />
                      {isCleaning ? "XML DIŞI ÜRÜN TEMİZLİĞİ AKTİF" : "TEMİZLİK BİTTİ"}
                    </span>
                    <span style={{ color: "var(--text-secondary)" }}>Sayfa {isCleaning ? cleanupPage : cleanupPage - 1} {cleanupTotalPages > 1 ? `/ ${cleanupTotalPages}` : ""}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem", textAlign: "center" }}>
                    <div style={{ background: "rgba(0,0,0,0.3)", padding: "0.5rem", borderRadius: "var(--radius-sm)" }}>
                      <div style={{ fontSize: "0.65rem", color: "var(--text-secondary)" }}>TARANAN</div>
                      <div style={{ fontWeight: "700" }}>{cleanupStats.scanned}</div>
                    </div>
                    <div style={{ background: "rgba(0,0,0,0.3)", padding: "0.5rem", borderRadius: "var(--radius-sm)" }}>
                      <div style={{ fontSize: "0.65rem", color: "var(--accent-warning)" }}>TEMİZLENEN</div>
                      <div style={{ fontWeight: "700", color: "var(--accent-warning)" }}>{cleanupStats.updated}</div>
                    </div>
                    <div style={{ background: "rgba(0,0,0,0.3)", padding: "0.5rem", borderRadius: "var(--radius-sm)" }}>
                      <div style={{ fontSize: "0.65rem", color: "var(--accent-danger)" }}>HATA</div>
                      <div style={{ fontWeight: "700", color: "var(--accent-danger)" }}>{cleanupStats.errors}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
                {!isSyncing && !isCleaning ? (
                  <>
                    <button className="btn btn-primary" style={{ flex: 2 }} onClick={startSync}>
                      <Play size={16} /> Senkronizasyonu Başlat
                    </button>
                    {cleanupPolicy !== "none" && (
                      <button className="btn btn-secondary" style={{ flex: 1, borderColor: "var(--accent-purple)", color: "var(--accent-purple)" }} onClick={handleStartCleanup}>
                        Temizliği Başlat
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    {isSyncing ? (
                      isPaused ? (
                        <button className="btn btn-primary" style={{ flex: 1 }} onClick={startSync}>
                          <Play size={16} /> Devam Et
                        </button>
                      ) : (
                        <button className="btn btn-secondary" style={{ flex: 1 }} onClick={pauseSync}>
                          <Pause size={16} /> Duraklat
                        </button>
                      )
                    ) : (
                      isPaused ? (
                        <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setIsCleaning(true)}>
                          <Play size={16} /> Devam Et
                        </button>
                      ) : (
                        <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setIsPaused(true)}>
                          <Pause size={16} /> Duraklat
                        </button>
                      )
                    )}
                  </>
                )}
                
                <button className="btn btn-secondary" onClick={handleResetSync} disabled={currentIndex === 0 && cleanupStats.scanned === 0 && !isSyncing && !isCleaning}>
                  <RotateCcw size={16} /> Sıfırla
                </button>
              </div>
            </div>

            {/* Terminal Console */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                  <Terminal size={14} />
                  <span>Canlı İşlem Logları</span>
                </div>
                {logs.length > 0 && (
                  <button style={{ background: "none", border: "none", color: "var(--accent-danger)", fontSize: "0.75rem", cursor: "pointer" }} onClick={() => setLogs([])}>Temizle</button>
                )}
              </div>
              <div className="terminal-console" ref={consoleRef}>
                {logs.length === 0 ? (
                  <div className="terminal-line line-muted">Senkronizasyon başlatıldığında işlem detayları burada anlık olarak akacaktır.</div>
                ) : (
                  logs.map((log, idx) => (
                    <div key={idx} className={`terminal-line line-${log.type}`}>
                      <span className="line-muted">[{log.timestamp}]</span> {log.message}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
