"use client";

import React, { createContext, useContext, useState, useEffect, useRef } from "react";

export interface MappingConfig {
  skuField: string;
  nameField: string;
  priceField: string;
  stockField: string;
  descriptionField: string;
  imageFields: string[];
}

export interface LogEntry {
  timestamp: string;
  type: "info" | "success" | "warning" | "error" | "muted";
  message: string;
}

export interface Stats {
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  error: number;
}

export interface AttributeMapping {
  wooName: string;
  xmlField: string;
  visible: boolean;
}

interface AppContextType {
  wooUrl: string;
  setWooUrl: (val: string) => void;
  consumerKey: string;
  setConsumerKey: (val: string) => void;
  consumerSecret: string;
  setConsumerSecret: (val: string) => void;
  xmlUrl: string;
  setXmlUrl: (val: string) => void;
  products: any[];
  setProducts: (val: any[]) => void;
  sampleProduct: any;
  setSampleProduct: (val: any) => void;
  xmlKeys: string[];
  setXmlKeys: (val: string[]) => void;
  mapping: MappingConfig;
  setMapping: React.Dispatch<React.SetStateAction<MappingConfig>>;
  priceMultiplier: string;
  setPriceMultiplier: (val: string) => void;
  priceAddition: string;
  setPriceAddition: (val: string) => void;
  attributeMappings: AttributeMapping[];
  setAttributeMappings: React.Dispatch<React.SetStateAction<AttributeMapping[]>>;
  excludedBrands: string[];
  setExcludedBrands: React.Dispatch<React.SetStateAction<string[]>>;
  fastSync: boolean;
  setFastSync: (val: boolean) => void;
  syncOnlyStockPrice: boolean;
  setSyncOnlyStockPrice: (val: boolean) => void;
  concurrency: number;
  setConcurrency: (val: number) => void;
  isSyncing: boolean;
  setIsSyncing: (val: boolean) => void;
  isPaused: boolean;
  setIsPaused: (val: boolean) => void;
  currentIndex: number;
  setCurrentIndex: (val: number) => void;
  stats: Stats;
  setStats: React.Dispatch<React.SetStateAction<Stats>>;
  logs: LogEntry[];
  setLogs: React.Dispatch<React.SetStateAction<LogEntry[]>>;
  isPreloadingWoo: boolean;
  preloadStatus: string;
  addLog: (message: string, type?: LogEntry["type"]) => void;
  saveWooSettings: () => void;
  startSync: () => Promise<void>;
  pauseSync: () => void;
  resetSync: () => void;
  wooProductsMapRef: React.MutableRefObject<Map<string, any>>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  // WooCommerce Config States
  const [wooUrl, setWooUrl] = useState("");
  const [consumerKey, setConsumerKey] = useState("");
  const [consumerSecret, setConsumerSecret] = useState("");
  const [xmlUrl, setXmlUrl] = useState("https://cdn1.xmlbankasi.com/p1/hbnfefbamtze/image/data/xml/setifera.xml");

  // XML States
  const [products, setProducts] = useState<any[]>([]);
  const [sampleProduct, setSampleProduct] = useState<any>(null);
  const [xmlKeys, setXmlKeys] = useState<string[]>([]);
  
  // Field Mapping State
  const [mapping, setMapping] = useState<MappingConfig>({
    skuField: "",
    nameField: "",
    priceField: "",
    stockField: "",
    descriptionField: "",
    imageFields: []
  });

  // Price Formula States
  const [priceMultiplier, setPriceMultiplier] = useState("1.0");
  const [priceAddition, setPriceAddition] = useState("0");

  // WooCommerce Custom Attribute States
  const [attributeMappings, setAttributeMappings] = useState<AttributeMapping[]>([
    { wooName: "Brand", xmlField: "", visible: true },
    { wooName: "BuyPrice", xmlField: "", visible: false }
  ]);

  // Brand Filtering States
  const [excludedBrands, setExcludedBrands] = useState<string[]>([]);

  // Performance & Advanced Sync States
  const [fastSync, setFastSync] = useState(true);
  const [syncOnlyStockPrice, setSyncOnlyStockPrice] = useState(false);
  const [concurrency, setConcurrency] = useState(5);
  const [isPreloadingWoo, setIsPreloadingWoo] = useState(false);
  const [preloadStatus, setPreloadStatus] = useState("");

  const wooProductsMapRef = useRef<Map<string, any>>(new Map());

  // Synchronization Engine States
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [stats, setStats] = useState<Stats>({
    processed: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    error: 0
  });
  
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Load configuration from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedUrl = localStorage.getItem("woo_url") || "";
      const storedKey = localStorage.getItem("woo_consumer_key") || "";
      const storedSecret = localStorage.getItem("woo_consumer_secret") || "";
      const storedXmlUrl = localStorage.getItem("xml_url") || "https://cdn1.xmlbankasi.com/p1/hbnfefbamtze/image/data/xml/setifera.xml";
      const storedMultiplier = localStorage.getItem("price_multiplier") || "1.0";
      const storedAddition = localStorage.getItem("price_addition") || "0";
      const storedFastSync = localStorage.getItem("sync_fast_sync") !== "false";
      const storedSyncOnlyStockPrice = localStorage.getItem("sync_only_stock_price") === "true";
      const storedConcurrency = parseInt(localStorage.getItem("sync_concurrency") || "5", 10);
      
      setWooUrl(storedUrl);
      setConsumerKey(storedKey);
      setConsumerSecret(storedSecret);
      setXmlUrl(storedXmlUrl);
      setPriceMultiplier(storedMultiplier);
      setPriceAddition(storedAddition);
      setFastSync(storedFastSync);
      setSyncOnlyStockPrice(storedSyncOnlyStockPrice);
      setConcurrency(storedConcurrency);

      const storedExcludedBrands = localStorage.getItem("excluded_brands");
      if (storedExcludedBrands) {
        try {
          setExcludedBrands(JSON.parse(storedExcludedBrands));
        } catch (e) {
          console.error("Stored excluded brands parse error:", e);
        }
      }

      const storedAttrMappings = localStorage.getItem("attribute_mappings");
      if (storedAttrMappings) {
        try {
          setAttributeMappings(JSON.parse(storedAttrMappings));
        } catch (e) {
          console.error("Stored attribute mappings parse error:", e);
        }
      }

      const storedMapping = localStorage.getItem("mapping_config");
      if (storedMapping) {
        try {
          setMapping(JSON.parse(storedMapping));
        } catch (e) {
          console.error("Stored mapping parse error:", e);
        }
      }
    }
  }, []);

  // Save config to localStorage
  const saveWooSettings = () => {
    localStorage.setItem("woo_url", wooUrl);
    localStorage.setItem("woo_consumer_key", consumerKey);
    localStorage.setItem("woo_consumer_secret", consumerSecret);
    localStorage.setItem("xml_url", xmlUrl);
    localStorage.setItem("price_multiplier", priceMultiplier);
    localStorage.setItem("price_addition", priceAddition);
    localStorage.setItem("attribute_mappings", JSON.stringify(attributeMappings));
    localStorage.setItem("excluded_brands", JSON.stringify(excludedBrands));
    localStorage.setItem("sync_fast_sync", fastSync.toString());
    localStorage.setItem("sync_only_stock_price", syncOnlyStockPrice.toString());
    localStorage.setItem("sync_concurrency", concurrency.toString());
    addLog("WooCommerce ve XML bağlantı ayarları yerel tarayıcı hafızasına kaydedildi.", "success");
  };

  // Save mapping to localStorage when it changes
  useEffect(() => {
    if (mapping.skuField) {
      localStorage.setItem("mapping_config", JSON.stringify(mapping));
    }
  }, [mapping]);

  // Auto-save advanced sync settings when they change
  useEffect(() => {
    localStorage.setItem("sync_fast_sync", fastSync.toString());
    localStorage.setItem("sync_only_stock_price", syncOnlyStockPrice.toString());
    localStorage.setItem("sync_concurrency", concurrency.toString());
  }, [fastSync, syncOnlyStockPrice, concurrency]);

  // Log addition helper
  const addLog = (message: string, type: LogEntry["type"] = "info") => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { timestamp, type, message }]);
  };

  // Refs to avoid stale closures in worker promises
  const isSyncingRef = useRef(isSyncing);
  const isPausedRef = useRef(isPaused);
  const currentIndexRef = useRef(currentIndex);
  const productsRef = useRef(products);
  const mappingRef = useRef(mapping);
  const wooUrlRef = useRef(wooUrl);
  const consumerKeyRef = useRef(consumerKey);
  const consumerSecretRef = useRef(consumerSecret);
  const priceMultiplierRef = useRef(priceMultiplier);
  const priceAdditionRef = useRef(priceAddition);
  const attributeMappingsRef = useRef(attributeMappings);
  const excludedBrandsRef = useRef(excludedBrands);
  const fastSyncRef = useRef(fastSync);
  const syncOnlyStockPriceRef = useRef(syncOnlyStockPrice);
  const concurrencyRef = useRef(concurrency);

  useEffect(() => { isSyncingRef.current = isSyncing; }, [isSyncing]);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { productsRef.current = products; }, [products]);
  useEffect(() => { mappingRef.current = mapping; }, [mapping]);
  useEffect(() => { wooUrlRef.current = wooUrl; }, [wooUrl]);
  useEffect(() => { consumerKeyRef.current = consumerKey; }, [consumerKey]);
  useEffect(() => { consumerSecretRef.current = consumerSecret; }, [consumerSecret]);
  useEffect(() => { priceMultiplierRef.current = priceMultiplier; }, [priceMultiplier]);
  useEffect(() => { priceAdditionRef.current = priceAddition; }, [priceAddition]);
  useEffect(() => { attributeMappingsRef.current = attributeMappings; }, [attributeMappings]);
  useEffect(() => { excludedBrandsRef.current = excludedBrands; }, [excludedBrands]);
  useEffect(() => { fastSyncRef.current = fastSync; }, [fastSync]);
  useEffect(() => { syncOnlyStockPriceRef.current = syncOnlyStockPrice; }, [syncOnlyStockPrice]);
  useEffect(() => { concurrencyRef.current = concurrency; }, [concurrency]);

  // Preload WooCommerce products for local caching
  const preloadWooCommerceProducts = async (): Promise<Map<string, any> | null> => {
    setIsPreloadingWoo(true);
    setPreloadStatus("WooCommerce ürün listesi alınıyor...");
    addLog("WooCommerce ürünleri önbelleğe yüklenmeye başlanıyor...", "info");

    const localMap = new Map<string, any>();
    let currentPage = 1;
    let totalPages = 1;

    try {
      while (currentPage <= totalPages) {
        setPreloadStatus(`WooCommerce ürünleri çekiliyor: Sayfa ${currentPage} / ${totalPages}...`);
        addLog(`WooCommerce ürünleri ön-yükleniyor: Sayfa ${currentPage} / ${totalPages || "?"}`, "info");

        const response = await fetch("/api/woo-products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wooConfig: {
              url: wooUrlRef.current,
              consumerKey: consumerKeyRef.current,
              consumerSecret: consumerSecretRef.current,
            },
            page: currentPage,
          }),
        });

        const data = await response.json();
        if (!data.success) {
          throw new Error(data.error || "WooCommerce'den ürünler çekilemedi.");
        }

        const batch = data.products || [];
        if (batch.length === 0) {
          break;
        }

        for (const item of batch) {
          const sku = String(item.sku || "").trim().toLowerCase();
          if (sku) {
            localMap.set(sku, item);
          }
        }

        totalPages = data.totalPages || 1;
        currentPage++;
      }

      addLog(`WooCommerce önbellekleme tamamlandı. Toplam ${localMap.size} benzersiz ürün yüklendi.`, "success");
      return localMap;
    } catch (err: any) {
      addLog(`WooCommerce önbellekleme hatası: ${err.message || err}`, "error");
      return null;
    } finally {
      setIsPreloadingWoo(false);
      setPreloadStatus("");
    }
  };

  // Check product changes locally to skip network calls
  const checkProductChangesLocally = (xmlProd: any, existingProduct: any, syncOnlyStockPrice: boolean) => {
    const changes: string[] = [];

    const priceStr = String(xmlProd[mappingRef.current.priceField] || "0").trim().replace(",", ".");
    const rawPrice = parseFloat(priceStr) || 0;
    const multiplier = parseFloat(priceMultiplierRef.current) || 1;
    const addition = parseFloat(priceAdditionRef.current) || 0;
    const targetPrice = Math.round((rawPrice * multiplier + addition) * 100) / 100;

    const targetStock = parseInt(xmlProd[mappingRef.current.stockField] || "0", 10) || 0;

    const existingPrice = parseFloat(existingProduct.regular_price || "0");
    if (existingPrice !== targetPrice) {
      changes.push(`Fiyat: ${existingPrice} -> ${targetPrice}`);
    }

    const existingStock = existingProduct.stock_quantity ?? 0;
    const isStockManaged = existingProduct.manage_stock === true;
    if (!isStockManaged || existingStock !== targetStock) {
      changes.push(`Stok: ${existingStock} (Yönetim: ${isStockManaged ? 'Açık' : 'Kapalı'}) -> ${targetStock}`);
    }

    if (!syncOnlyStockPrice) {
      const targetName = String(xmlProd[mappingRef.current.nameField] || "").trim();
      if (targetName !== "" && existingProduct.name !== targetName) {
        changes.push(`İsim: "${existingProduct.name}" -> "${targetName}"`);
      }

      let targetDesc = String(xmlProd[mappingRef.current.descriptionField] || "").trim();
      targetDesc = targetDesc.replace(/Filiz Aksesuar/gi, "Setifera");
      const existingDesc = (existingProduct.description || "").trim();
      if (targetDesc !== "" && existingDesc !== targetDesc) {
        changes.push("Açıklama güncellendi");
      }

      const imageFields = mappingRef.current.imageFields || [];
      const newImageSrcs = imageFields
        .map((field: string) => xmlProd[field])
        .filter((val: any) => typeof val === "string" && val.trim() !== "")
        .map((url: string) => url.trim());
      const existingImageSrcs = (existingProduct.images || []).map((img: any) => img.src.trim());
      if (newImageSrcs.length > 0 && JSON.stringify(existingImageSrcs) !== JSON.stringify(newImageSrcs)) {
        changes.push("Görseller güncellendi");
      }

      const existingAttrs = existingProduct.attributes || [];
      for (const attrMap of attributeMappingsRef.current) {
        if (!attrMap.wooName) continue;
        let xmlVal = "";
        if (attrMap.xmlField === "__extract_gender__") {
          const nameVal = String(xmlProd[mappingRef.current.nameField] || "").toLowerCase();
          if (nameVal.includes("unisex")) xmlVal = "Unisex";
          else if (nameVal.includes("erkek")) xmlVal = "Erkek";
          else if (nameVal.includes("kadın") || nameVal.includes("kadin") || nameVal.includes("bayan")) xmlVal = "Kadın";
        } else {
          xmlVal = String(xmlProd[attrMap.xmlField] || "").trim();
        }
        if (!xmlVal) continue;

        const existingAttr = existingAttrs.find(
          (a: any) => a.name.toLowerCase() === attrMap.wooName.toLowerCase()
        );
        if (!existingAttr) {
          changes.push(`Eksik Nitelik: ${attrMap.wooName}`);
        } else {
          const existingVal = existingAttr.options?.[0] || "";
          if (existingVal !== xmlVal) {
            changes.push(`Özellik (${attrMap.wooName}): "${existingVal}" -> "${xmlVal}"`);
          }
        }
      }
    }

    return {
      hasChanges: changes.length > 0,
      changes
    };
  };

  // Run the concurrent synchronization queue
  const runSyncQueue = async (startIdx: number, xmlProducts: any[], localCache: Map<string, any> | null) => {
    let nextIndex = startIdx;
    
    const worker = async () => {
      while (true) {
        if (!isSyncingRef.current || isPausedRef.current) {
          break;
        }

        const idx = nextIndex++;
        if (idx >= xmlProducts.length) {
          break;
        }

        setCurrentIndex(nextIndex);

        const product = xmlProducts[idx];
        const sku = String(product[mappingRef.current.skuField] || `Bilinmeyen SKU (#${idx})`).trim();

        const brandMapping = attributeMappingsRef.current.find(am => am.wooName.toLowerCase() === "brand");
        const brandField = brandMapping?.xmlField || "Brand";
        const productBrand = String(product[brandField] || "").trim();

        if (productBrand && excludedBrandsRef.current.includes(productBrand)) {
          addLog(`[Atlandı] SKU "${sku}" - "${productBrand}" markası filtrelendiği için aktarılmadı.`, "muted");
          setStats(prev => ({ ...prev, processed: prev.processed + 1, skipped: prev.skipped + 1 }));
          continue;
        }

        const existingProduct = localCache ? localCache.get(sku.toLowerCase()) : null;

        if (localCache && existingProduct) {
          const comparison = checkProductChangesLocally(product, existingProduct, syncOnlyStockPriceRef.current);
          if (!comparison.hasChanges) {
            setStats(prev => ({ ...prev, processed: prev.processed + 1, skipped: prev.skipped + 1 }));
            addLog(`ℹ SKU "${sku}" güncel olduğu için atlandı (Yerel önbellek doğrulaması).`, "muted");
            continue;
          } else {
            addLog(`⚡ SKU "${sku}" değişiklik tespit edildi: ${comparison.changes.join(", ")}`, "info");
          }
        } else if (localCache) {
          addLog(`[Yeni Ürün] SKU "${sku}" WooCommerce'de bulunamadı. Oluşturulacak...`, "info");
        } else {
          addLog(`[${idx + 1}/${xmlProducts.length}] SKU "${sku}" WooCommerce ile senkronize ediliyor...`, "info");
        }

        try {
          const response = await fetch("/api/sync-product", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              wooConfig: {
                url: wooUrlRef.current,
                consumerKey: consumerKeyRef.current,
                consumerSecret: consumerSecretRef.current
              },
              product,
              mapping: mappingRef.current,
              priceMultiplier: priceMultiplierRef.current,
              priceAddition: priceAdditionRef.current,
              attributeMappings: attributeMappingsRef.current,
              existingProduct: existingProduct,
              syncOnlyStockPrice: syncOnlyStockPriceRef.current
            })
          });

          if (!isSyncingRef.current) break;

          const result = await response.json();

          if (result.success) {
            if (result.status === "created") {
              setStats(prev => ({ ...prev, processed: prev.processed + 1, created: prev.created + 1 }));
              addLog(`✔ SKU "${sku}" WooCommerce'de yeni ürün olarak oluşturuldu (ID: ${result.id}).`, "success");
              if (localCache) {
                localCache.set(sku.toLowerCase(), {
                  id: result.id,
                  sku: sku,
                  name: String(product[mappingRef.current.nameField] || "").trim(),
                  regular_price: (Math.round((parseFloat(String(product[mappingRef.current.priceField] || "0").trim().replace(",", ".")) * (parseFloat(priceMultiplierRef.current) || 1) + (parseFloat(priceAdditionRef.current) || 0)) * 100) / 100).toString(),
                  stock_quantity: parseInt(product[mappingRef.current.stockField] || "0", 10) || 0,
                  manage_stock: true,
                  description: String(product[mappingRef.current.descriptionField] || "").trim().replace(/Filiz Aksesuar/gi, "Setifera"),
                  images: (mappingRef.current.imageFields || []).map((field: string) => product[field]).filter((val: any) => typeof val === "string" && val.trim() !== "").map((url: string) => ({ src: url.trim() })),
                  attributes: []
                });
              }
            } else if (result.status === "updated") {
              setStats(prev => ({ ...prev, processed: prev.processed + 1, updated: prev.updated + 1 }));
              addLog(`⚡ SKU "${sku}" güncellendi: ${result.changes.join(", ")}`, "warning");
              if (localCache && existingProduct) {
                const updatedProduct = {
                  ...existingProduct,
                  name: String(product[mappingRef.current.nameField] || "").trim(),
                  regular_price: (Math.round((parseFloat(String(product[mappingRef.current.priceField] || "0").trim().replace(",", ".")) * (parseFloat(priceMultiplierRef.current) || 1) + (parseFloat(priceAdditionRef.current) || 0)) * 100) / 100).toString(),
                  stock_quantity: parseInt(product[mappingRef.current.stockField] || "0", 10) || 0,
                  manage_stock: true,
                  description: String(product[mappingRef.current.descriptionField] || "").trim().replace(/Filiz Aksesuar/gi, "Setifera")
                };
                localCache.set(sku.toLowerCase(), updatedProduct);
              }
            } else if (result.status === "skipped") {
              setStats(prev => ({ ...prev, processed: prev.processed + 1, skipped: prev.skipped + 1 }));
              addLog(`ℹ SKU "${sku}" güncel olduğu için atlandı.`, "muted");
            }
          } else {
            setStats(prev => ({ ...prev, processed: prev.processed + 1, error: prev.error + 1 }));
            addLog(`❌ SKU "${sku}" senkronizasyon hatası: ${result.error}`, "error");
          }
        } catch (err: any) {
          if (!isSyncingRef.current) break;
          setStats(prev => ({ ...prev, processed: prev.processed + 1, error: prev.error + 1 }));
          addLog(`❌ SKU "${sku}" sunucuyla haberleşme hatası: ${err.message || err}`, "error");
        }
      }
    };

    const workerPromises: Promise<void>[] = [];
    const numWorkers = Math.min(concurrencyRef.current, xmlProducts.length - startIdx);
    
    addLog(`Paralel senkronizasyon başlatılıyor. Eş zamanlı istek sayısı: ${numWorkers}`, "info");

    for (let i = 0; i < numWorkers; i++) {
      workerPromises.push(worker());
    }

    await Promise.all(workerPromises);

    if (isSyncingRef.current && !isPausedRef.current && nextIndex >= xmlProducts.length) {
      setIsSyncing(false);
      isSyncingRef.current = false;
      addLog("Senkronizasyon işlemi tamamlandı!", "success");
    }
  };

  const startSync = async () => {
    if (!wooUrl || !consumerKey || !consumerSecret) {
      addLog("Lütfen WooCommerce API bağlantı ayarlarını girin ve kaydedin.", "error");
      return;
    }
    if (!mapping.skuField || !mapping.nameField || !mapping.priceField || !mapping.stockField) {
      addLog("Lütfen WooCommerce için gerekli SKU, Adı, Fiyat ve Stok alanlarını eşleştirin.", "error");
      return;
    }
    if (products.length === 0) {
      addLog("Senkronizasyona başlamadan önce XML dosyasını yüklemelisiniz.", "error");
      return;
    }

    setIsSyncing(true);
    setIsPaused(false);
    
    isSyncingRef.current = true;
    isPausedRef.current = false;

    addLog("Senkronizasyon işlemi başlatıldı...", "success");

    let localCache = wooProductsMapRef.current;
    
    if (fastSync && localCache.size === 0) {
      const preloadedMap = await preloadWooCommerceProducts();
      if (!preloadedMap) {
        setIsSyncing(false);
        isSyncingRef.current = false;
        return;
      }
      wooProductsMapRef.current = preloadedMap;
      localCache = preloadedMap;
    } else if (!fastSync) {
      localCache = new Map();
      wooProductsMapRef.current = new Map();
    }

    runSyncQueue(currentIndex, products, fastSync ? localCache : null);
  };

  const pauseSync = () => {
    setIsPaused(true);
    isPausedRef.current = true;
    addLog("Senkronizasyon işlemi duraklatıldı.", "warning");
  };

  const resetSync = () => {
    setIsSyncing(false);
    setIsPaused(false);
    isSyncingRef.current = false;
    isPausedRef.current = false;
    wooProductsMapRef.current = new Map();
    setCurrentIndex(0);
    setStats({
      processed: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      error: 0
    });
    setLogs([]);
    addLog("Senkronizasyon süreci sıfırlandı.", "info");
  };

  return (
    <AppContext.Provider value={{
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
      isSyncing, setIsSyncing,
      isPaused, setIsPaused,
      currentIndex, setCurrentIndex,
      stats, setStats,
      logs, setLogs,
      isPreloadingWoo, preloadStatus,
      addLog, saveWooSettings,
      startSync, pauseSync, resetSync,
      wooProductsMapRef
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within AppProvider");
  return context;
}
