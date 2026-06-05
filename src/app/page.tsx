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
  Activity,
  HelpCircle,
  Search
} from "lucide-react";

interface WooConfig {
  url: string;
  consumerKey: string;
  consumerSecret: string;
}

interface MappingConfig {
  skuField: string;
  nameField: string;
  priceField: string;
  stockField: string;
  descriptionField: string;
  imageFields: string[];
}

interface LogEntry {
  timestamp: string;
  type: "info" | "success" | "warning" | "error" | "muted";
  message: string;
}

export default function Home() {
  // WooCommerce Config States
  const [wooUrl, setWooUrl] = useState("");
  const [consumerKey, setConsumerKey] = useState("");
  const [consumerSecret, setConsumerSecret] = useState("");
  const [xmlUrl, setXmlUrl] = useState("https://cdn1.xmlbankasi.com/p1/hbnfefbamtze/image/data/xml/setifera.xml");

  // App States
  const [isLoadingXml, setIsLoadingXml] = useState(false);
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

  // Synchronization Engine States
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [stats, setStats] = useState({
    processed: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    error: 0
  });
  
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const consoleRef = useRef<HTMLDivElement>(null);

  // Price Formula States
  const [priceMultiplier, setPriceMultiplier] = useState("1.0");
  const [priceAddition, setPriceAddition] = useState("0");

  // Cleanup States
  const [cleanupPolicy, setCleanupPolicy] = useState("none");
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanupPage, setCleanupPage] = useState(1);
  const [cleanupTotalPages, setCleanupTotalPages] = useState(1);
  const [cleanupStats, setCleanupStats] = useState({ scanned: 0, updated: 0, errors: 0 });
  const cleanupStatsRef = useRef({ scanned: 0, updated: 0, errors: 0 });

  // WooCommerce Custom Attribute States
  const [attributeMappings, setAttributeMappings] = useState<Array<{ wooName: string; xmlField: string; visible: boolean }>>([
    { wooName: "Brand", xmlField: "", visible: true },
    { wooName: "BuyPrice", xmlField: "", visible: false }
  ]);

  // Brand Filtering States
  const [excludedBrands, setExcludedBrands] = useState<string[]>([]);

  // Product Search States
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchError, setSearchError] = useState("");
  const [singleSyncingSku, setSingleSyncingSku] = useState<string | null>(null);

  // Performance & Advanced Sync States
  const [fastSync, setFastSync] = useState(true);
  const [syncOnlyStockPrice, setSyncOnlyStockPrice] = useState(false);
  const [concurrency, setConcurrency] = useState(5);
  const [isPreloadingWoo, setIsPreloadingWoo] = useState(false);
  const [preloadStatus, setPreloadStatus] = useState("");

  const wooProductsMapRef = useRef<Map<string, any>>(new Map());

  // Load configuration and mapping from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedUrl = localStorage.getItem("woo_url") || "";
      const storedKey = localStorage.getItem("woo_consumer_key") || "";
      const storedSecret = localStorage.getItem("woo_consumer_secret") || "";
      const storedXmlUrl = localStorage.getItem("xml_url") || "https://cdn1.xmlbankasi.com/p1/hbnfefbamtze/image/data/xml/setifera.xml";
      const storedMultiplier = localStorage.getItem("price_multiplier") || "1.0";
      const storedAddition = localStorage.getItem("price_addition") || "0";
      const storedCleanupPolicy = localStorage.getItem("cleanup_policy") || "none";
      const storedFastSync = localStorage.getItem("sync_fast_sync") !== "false";
      const storedSyncOnlyStockPrice = localStorage.getItem("sync_only_stock_price") === "true";
      const storedConcurrency = parseInt(localStorage.getItem("sync_concurrency") || "5", 10);
      
      setWooUrl(storedUrl);
      setConsumerKey(storedKey);
      setConsumerSecret(storedSecret);
      setXmlUrl(storedXmlUrl);
      setPriceMultiplier(storedMultiplier);
      setPriceAddition(storedAddition);
      setCleanupPolicy(storedCleanupPolicy);
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
    localStorage.setItem("cleanup_policy", cleanupPolicy);
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

  // Auto-scroll logs console to bottom
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [logs]);

  // Log addition helper
  const addLog = (message: string, type: LogEntry["type"] = "info") => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { timestamp, type, message }]);
  };

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

        // Auto-detect and map fields if mapping is not already set
        const existingMapping = localStorage.getItem("mapping_config");
        if (!existingMapping) {
          // Heuristic automatic mapping
          const sku = keys.find(k => k.toLowerCase() === "product_code" || k.toLowerCase() === "product_id" || k.toLowerCase() === "sku" || k.toLowerCase() === "barcode") || "";
          const name = keys.find(k => k.toLowerCase() === "name" || k.toLowerCase() === "title" || k.toLowerCase() === "urun_adi") || "";
          const price = keys.find(k => k.toLowerCase() === "price" || k.toLowerCase() === "fiyat") || "";
          const stock = keys.find(k => k.toLowerCase() === "stock" || k.toLowerCase() === "stok" || k.toLowerCase() === "quantity" || k.toLowerCase() === "adet") || "";
          const desc = keys.find(k => k.toLowerCase() === "description" || k.toLowerCase() === "aciklama" || k.toLowerCase() === "detay") || "";
          
          // Image fields auto-detect
          const imgs = keys.filter(k => k.toLowerCase().includes("image") || k.toLowerCase().includes("resim"));

          const newMapping: MappingConfig = {
            skuField: sku,
            nameField: name,
            priceField: price,
            stockField: stock,
            descriptionField: desc,
            imageFields: imgs.slice(0, 5) // limit to 5 images by default
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

  // Refs to keep track of running sync parameters and state to avoid stale closures in workers
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

  // Sync refs to state
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
          break; // no more products
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

    // Calculate XML target price
    const priceStr = String(xmlProd[mappingRef.current.priceField] || "0").trim().replace(",", ".");
    const rawPrice = parseFloat(priceStr) || 0;
    const multiplier = parseFloat(priceMultiplierRef.current) || 1;
    const addition = parseFloat(priceAdditionRef.current) || 0;
    const targetPrice = Math.round((rawPrice * multiplier + addition) * 100) / 100;

    // Calculate XML target stock
    const targetStock = parseInt(xmlProd[mappingRef.current.stockField] || "0", 10) || 0;

    // Compare price
    const existingPrice = parseFloat(existingProduct.regular_price || "0");
    if (existingPrice !== targetPrice) {
      changes.push(`Fiyat: ${existingPrice} -> ${targetPrice}`);
    }

    // Compare stock
    const existingStock = existingProduct.stock_quantity ?? 0;
    const isStockManaged = existingProduct.manage_stock === true;
    if (!isStockManaged || existingStock !== targetStock) {
      changes.push(`Stok: ${existingStock} (Yönetim: ${isStockManaged ? 'Açık' : 'Kapalı'}) -> ${targetStock}`);
    }

    if (!syncOnlyStockPrice) {
      // Compare name
      const targetName = String(xmlProd[mappingRef.current.nameField] || "").trim();
      if (targetName !== "" && existingProduct.name !== targetName) {
        changes.push(`İsim: "${existingProduct.name}" -> "${targetName}"`);
      }

      // Compare description
      let targetDesc = String(xmlProd[mappingRef.current.descriptionField] || "").trim();
      targetDesc = targetDesc.replace(/Filiz Aksesuar/gi, "Setifera");
      const existingDesc = (existingProduct.description || "").trim();
      if (targetDesc !== "" && existingDesc !== targetDesc) {
        changes.push("Açıklama güncellendi");
      }

      // Compare images
      const imageFields = mappingRef.current.imageFields || [];
      const newImageSrcs = imageFields
        .map((field: string) => xmlProd[field])
        .filter((val: any) => typeof val === "string" && val.trim() !== "")
        .map((url: string) => url.trim());
      const existingImageSrcs = (existingProduct.images || []).map((img: any) => img.src.trim());
      if (newImageSrcs.length > 0 && JSON.stringify(existingImageSrcs) !== JSON.stringify(newImageSrcs)) {
        changes.push("Görseller güncellendi");
      }

      // Compare attributes
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

        // Keep track of resume index
        setCurrentIndex(nextIndex);

        const product = xmlProducts[idx];
        const sku = String(product[mappingRef.current.skuField] || `Bilinmeyen SKU (#${idx})`).trim();

        // Brand filtering
        const brandMapping = attributeMappingsRef.current.find(am => am.wooName.toLowerCase() === "brand");
        const brandField = brandMapping?.xmlField || "Brand";
        const productBrand = String(product[brandField] || "").trim();

        if (productBrand && excludedBrandsRef.current.includes(productBrand)) {
          addLog(`[Atlandı] SKU "${sku}" - "${productBrand}" markası filtrelendiği için aktarılmadı.`, "muted");
          setStats(prev => ({ ...prev, processed: prev.processed + 1, skipped: prev.skipped + 1 }));
          continue;
        }

        // Cache lookup
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

        // API Request to sync-product
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
          
          // Stop cleanup if no more products are returned from WooCommerce
          if (wooProducts.length === 0) {
            setIsCleaning(false);
            const stats = cleanupStatsRef.current;
            addLog(`Temizlik işlemi tamamlandı! Toplam Taranan Ürün: ${stats.scanned}, Temizlenen/Güncellenen: ${stats.updated}, Hata: ${stats.errors}`, "success");
            return;
          }

          const brandMapping = attributeMappings.find(am => am.wooName.toLowerCase() === "brand");
          const brandField = brandMapping?.xmlField || "Brand";

          const xmlSkus = new Set(products.map(p => String(p[mapping.skuField] || "").trim().toLowerCase()));
          
          // Map of SKU to Brand name in XML
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

          // Fetch next page
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
  }, [isCleaning, isPaused, cleanupPage, cleanupTotalPages, products, mapping, wooUrl, consumerKey, consumerSecret, cleanupPolicy, excludedBrands]);

  // Sync Controls
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
    
    // Update refs immediately to avoid state delay checks in workers
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
    setIsCleaning(false);
    isSyncingRef.current = false;
    isPausedRef.current = false;
    wooProductsMapRef.current = new Map(); // clear cache
    setCurrentIndex(0);
    setStats({
      processed: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      error: 0
    });
    setCleanupPage(1);
    setCleanupTotalPages(1);
    setCleanupStats({ scanned: 0, updated: 0, errors: 0 });
    cleanupStatsRef.current = { scanned: 0, updated: 0, errors: 0 };
    setLogs([]);
    addLog("Senkronizasyon ve temizlik süreci sıfırlandı.", "info");
  };

  const startCleanup = () => {
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

    setIsSyncing(false);
    setIsCleaning(true);
    setIsPaused(false);
    setCleanupPage(1);
    setCleanupTotalPages(1);
    setCleanupStats({ scanned: 0, updated: 0, errors: 0 });
    cleanupStatsRef.current = { scanned: 0, updated: 0, errors: 0 };
    addLog("WooCommerce üzerinde XML dışı ürün temizleme taraması başlatıldı...", "warning");
  };

  // Search and Comparison Functions
  const handleSearchProducts = async () => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchError("Lütfen aramak için bir ürün adı veya SKU girin.");
      return;
    }

    if (products.length === 0) {
      setSearchError("Arama yapabilmek için önce XML verisini yüklemelisiniz.");
      return;
    }

    if (!wooUrl || !consumerKey || !consumerSecret) {
      setSearchError("WooCommerce API bağlantı bilgileri eksik.");
      return;
    }

    setIsSearching(true);
    setSearchError("");
    setSearchResults([]);

    try {
      // 1. Search locally in XML (using Turkish locale-aware lowercasing to handle İ/I characters)
      const queryLower = query.toLocaleLowerCase('tr-TR');
      const matchedXml = products.filter(p => {
        const pName = String(p[mapping.nameField] || "").toLocaleLowerCase('tr-TR');
        const pSku = String(p[mapping.skuField] || "").toLocaleLowerCase('tr-TR');
        return pName.includes(queryLower) || pSku.includes(queryLower);
      });

      // 2. Search in WooCommerce via API (sending original search query to support case-sensitive DB collations)
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

        // Get BuyPrice attribute name dynamically from user's mapping configuration (defaults to 'BuyPrice')
        const buyPriceMapping = attributeMappings.find(am => am.xmlField === mapping.priceField);
        const buyPriceWooName = buyPriceMapping ? buyPriceMapping.wooName : "BuyPrice";

        const wooBuyPriceAttr = wooProd?.attributes?.find(
          (a: any) => a.name.toLowerCase() === buyPriceWooName.toLowerCase()
        );
        const wooBuyPrice = wooBuyPriceAttr ? parseFloat(String(wooBuyPriceAttr.options?.[0] || "0").trim().replace(",", ".")) : 0;

        // Check discrepancies
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
        // Refresh comparison results
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

  // Mapping Helper Functions
  const handleMappingChange = (field: keyof MappingConfig, value: string) => {
    setMapping(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const addImageField = () => {
    setMapping(prev => ({
      ...prev,
      imageFields: [...prev.imageFields, ""]
    }));
  };

  const removeImageField = (index: number) => {
    setMapping(prev => {
      const updated = [...prev.imageFields];
      updated.splice(index, 1);
      return {
        ...prev,
        imageFields: updated
      };
    });
  };

  const updateImageField = (index: number, value: string) => {
    setMapping(prev => {
      const updated = [...prev.imageFields];
      updated[index] = value;
      return {
        ...prev,
        imageFields: updated
      };
    });
  };

  // Percent calculator
  const progressPercent = products.length > 0 ? Math.round((stats.processed / products.length) * 100) : 0;

  return (
    <div className="app-container">
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
                XML Çekiliyor ve Ayrıştırılıyor...
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

      {/* Grid: Mapping & Tree Configuration (Conditional) */}
      {products.length > 0 && sampleProduct && (
        <div className="dashboard-grid" style={{ marginBottom: "1.5rem" }}>
          {/* XML Template Preview */}
          <section className="glass-card">
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
              <FileText size={20} style={{ color: "var(--accent-indigo)" }} />
              <h2 style={{ fontSize: "1.2rem" }}>3. XML Ürün Şablonu</h2>
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "1rem" }}>
              Aşağıda XML dosyanızdan çekilen ilk ürünün veri yapısı gösterilmektedir. Bu alan adlarını sağ taraftaki WooCommerce alanlarıyla eşleştirebilirsiniz.
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
            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "1rem" }}>
              Hangi XML alanının hangi WooCommerce özelliğine aktarılacağını seçin:
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {/* SKU mapping */}
              <div className="mapping-row">
                <span className="mapping-dest-label">SKU (Ürün Kodu) *</span>
                <ArrowRight size={14} style={{ color: "var(--text-muted)" }} />
                <select 
                  className="form-select"
                  value={mapping.skuField}
                  onChange={(e) => handleMappingChange("skuField", e.target.value)}
                >
                  <option value="">-- XML Alanı Seçin --</option>
                  {xmlKeys.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>

              {/* Name mapping */}
              <div className="mapping-row">
                <span className="mapping-dest-label">Ürün Adı *</span>
                <ArrowRight size={14} style={{ color: "var(--text-muted)" }} />
                <select 
                  className="form-select"
                  value={mapping.nameField}
                  onChange={(e) => handleMappingChange("nameField", e.target.value)}
                >
                  <option value="">-- XML Alanı Seçin --</option>
                  {xmlKeys.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>

              {/* Price mapping */}
              <div className="mapping-row">
                <span className="mapping-dest-label">Satış Fiyatı *</span>
                <ArrowRight size={14} style={{ color: "var(--text-muted)" }} />
                <select 
                  className="form-select"
                  value={mapping.priceField}
                  onChange={(e) => handleMappingChange("priceField", e.target.value)}
                >
                  <option value="">-- XML Alanı Seçin --</option>
                  {xmlKeys.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>

              {/* Stock mapping */}
              <div className="mapping-row">
                <span className="mapping-dest-label">Stok Adedi *</span>
                <ArrowRight size={14} style={{ color: "var(--text-muted)" }} />
                <select 
                  className="form-select"
                  value={mapping.stockField}
                  onChange={(e) => handleMappingChange("stockField", e.target.value)}
                >
                  <option value="">-- XML Alanı Seçin --</option>
                  {xmlKeys.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>

              {/* Description mapping */}
              <div className="mapping-row">
                <span className="mapping-dest-label">Açıklama (Detay)</span>
                <ArrowRight size={14} style={{ color: "var(--text-muted)" }} />
                <select 
                  className="form-select"
                  value={mapping.descriptionField}
                  onChange={(e) => handleMappingChange("descriptionField", e.target.value)}
                >
                  <option value="">-- Eşleştirmeyi Atla --</option>
                  {xmlKeys.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>

              {/* Images mapping (Dynamic multiple) */}
              <div style={{ marginTop: "0.5rem", borderTop: "1px solid var(--border-color)", paddingTop: "0.75rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <label className="form-label" style={{ margin: 0 }}>Görsel URL Alanları</label>
                  <button className="btn btn-secondary" style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }} onClick={addImageField}>
                    <Plus size={12} /> Görsel Ekle
                  </button>
                </div>

                {mapping.imageFields.map((imageField, idx) => (
                  <div key={idx} className="mapping-row" style={{ marginTop: "0.4rem" }}>
                    <span className="mapping-dest-label" style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                      Görsel #{idx + 1}
                    </span>
                    <ArrowRight size={14} style={{ color: "var(--text-muted)" }} />
                    <div style={{ display: "flex", gap: "0.5rem", width: "100%" }}>
                      <select 
                        className="form-select"
                        value={imageField}
                        onChange={(e) => updateImageField(idx, e.target.value)}
                      >
                        <option value="">-- XML Görsel Alanı Seçin --</option>
                        {xmlKeys.map(k => <option key={k} value={k}>{k}</option>)}
                      </select>
                      <button className="btn btn-danger" style={{ padding: "0.5rem" }} onClick={() => removeImageField(idx)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
                
                {mapping.imageFields.length === 0 && (
                  <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", textAlign: "center", padding: "0.5rem" }}>
                    Eşleştirilen görsel bulunmuyor. Senkronize edilen ürünler görselsiz yüklenecektir.
                  </p>
                )}
              </div>

              {/* Fiyat Formülü (Kâr Marjı) Ayarları */}
              <div style={{ marginTop: "1rem", borderTop: "1px solid var(--border-color)", paddingTop: "1rem" }}>
                <label className="form-label" style={{ fontWeight: "600", color: "var(--accent-indigo)", marginBottom: "0.5rem" }}>
                  Fiyat Formülü Ayarları (Kâr Oranı)
                </label>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.75rem", marginBottom: "0.75rem" }}>
                  XML fiyatına çarpan katsayısı ve sabit artış ekleyebilirsiniz. Formül: (XML Fiyatı × Çarpan) + Sabit Artış
                </p>
                
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
                  <div>
                    <label className="form-label" style={{ fontSize: "0.75rem" }}>Fiyat Çarpanı (Katsayı)</label>
                    <input 
                      type="number" 
                      step="0.01" 
                      min="0"
                      className="form-input" 
                      placeholder="Örn: 1.25"
                      value={priceMultiplier}
                      onChange={(e) => setPriceMultiplier(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="form-label" style={{ fontSize: "0.75rem" }}>Sabit Artış Tutarı</label>
                    <input 
                      type="number" 
                      step="1" 
                      min="0"
                      className="form-input" 
                      placeholder="Örn: 50"
                      value={priceAddition}
                      onChange={(e) => setPriceAddition(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ padding: "0.75rem", background: "var(--accent-info-bg)", border: "1px solid var(--accent-info)", borderRadius: "var(--radius-sm)", fontSize: "0.75rem", color: "var(--text-primary)" }}>
                  <strong>Canlı Hesaplama Önizleme:</strong>
                  <div style={{ marginTop: "0.25rem", color: "var(--text-secondary)" }}>
                    XML'de <strong>100.00 TL</strong> olan bir ürün sitenizde{" "}
                    <strong style={{ color: "var(--accent-success)", fontSize: "0.85rem" }}>
                      {(Math.round((100 * (parseFloat(priceMultiplier) || 1) + (parseFloat(priceAddition) || 0)) * 100) / 100).toFixed(2)} TL
                    </strong>{" "}
                    olarak güncellenecektir.
                  </div>
                </div>
              </div>

              {/* Ürün Nitelikleri (Attributes) Eşleştirmesi */}
              <div style={{ marginTop: "1rem", borderTop: "1px solid var(--border-color)", paddingTop: "1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <label className="form-label" style={{ fontWeight: "600", color: "var(--accent-purple)", margin: 0 }}>
                    WooCommerce Nitelik Eşleştirmeleri (Attributes)
                  </label>
                  <button 
                    className="btn btn-secondary" 
                    style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }} 
                    onClick={() => setAttributeMappings(prev => [...prev, { wooName: "", xmlField: "", visible: false }])}
                  >
                    <Plus size={12} /> Nitelik Ekle
                  </button>
                </div>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.75rem", marginBottom: "0.75rem" }}>
                  WooCommerce tarafındaki özel nitelikleri XML alanları ile eşleştirin. (Örn: Brand, BuyPrice vb.)
                </p>

                {attributeMappings.map((attr, idx) => (
                  <div key={idx} style={{ background: "rgba(0,0,0,0.15)", padding: "0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)", marginBottom: "0.5rem" }}>
                    <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="Nitelik Adı (Örn: Brand)"
                        value={attr.wooName}
                        onChange={(e) => {
                          const updated = [...attributeMappings];
                          updated[idx].wooName = e.target.value;
                          setAttributeMappings(updated);
                        }}
                        style={{ flex: 1 }}
                      />
                      <select 
                        className="form-select"
                        value={attr.xmlField}
                        onChange={(e) => {
                          const updated = [...attributeMappings];
                          updated[idx].xmlField = e.target.value;
                          setAttributeMappings(updated);
                        }}
                        style={{ flex: 1 }}
                      >
                        <option value="">-- XML Alanı Seçin --</option>
                        <option value="__extract_gender__" style={{ color: "var(--accent-indigo)", fontWeight: "600" }}>
                          ⚡ İsimden Cinsiyet Ayıkla
                        </option>
                        {xmlKeys.map(k => <option key={k} value={k}>{k}</option>)}
                      </select>
                      <button 
                        className="btn btn-danger" 
                        style={{ padding: "0.5rem" }} 
                        onClick={() => {
                          const updated = [...attributeMappings];
                          updated.splice(idx, 1);
                          setAttributeMappings(updated);
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <input 
                        type="checkbox" 
                        id={`attr-visible-${idx}`}
                        checked={attr.visible}
                        onChange={(e) => {
                          const updated = [...attributeMappings];
                          updated[idx].visible = e.target.checked;
                          setAttributeMappings(updated);
                        }}
                        style={{ cursor: "pointer", width: "14px", height: "14px" }}
                      />
                      <label htmlFor={`attr-visible-${idx}`} style={{ fontSize: "0.75rem", color: "var(--text-secondary)", cursor: "pointer", userSelect: "none" }}>
                        Ürün sayfasında nitelik tablosunda gösterilsin (Visible on product page)
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              {/* Marka Filtreleme ve Engelleme */}
              {products.length > 0 && (
                <div style={{ marginTop: "1rem", borderTop: "1px solid var(--border-color)", paddingTop: "1rem" }}>
                  <label className="form-label" style={{ fontWeight: "600", color: "var(--accent-warning)", marginBottom: "0.5rem" }}>
                    Marka Filtreleme ve Engelleme (Brand Filters)
                  </label>
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.75rem", marginBottom: "0.75rem" }}>
                    Senkronize edilmesini istemediğiniz markaları seçerek engelleyin. Engelli markaların ürünleri sitenizden temizlenir.
                  </p>
                  
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
                          <input 
                            type="checkbox" 
                            checked={isExcluded} 
                            readOnly
                            style={{ cursor: "pointer", width: "13px", height: "13px" }}
                          />
                          <span style={{ fontSize: "0.75rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: isExcluded ? "var(--accent-danger)" : "var(--text-primary)", fontWeight: isExcluded ? "600" : "400" }} title={brand}>
                            {brand}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Performans ve Senkronizasyon Seçenekleri */}
              <div style={{ marginTop: "1rem", borderTop: "1px solid var(--border-color)", paddingTop: "1rem" }}>
                <label className="form-label" style={{ fontWeight: "600", color: "var(--accent-indigo)", marginBottom: "0.5rem" }}>
                  Senkronizasyon Seçenekleri & Hız Ayarları
                </label>
                
                <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginBottom: "0.75rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <input 
                      type="checkbox" 
                      id="sync-fast"
                      checked={fastSync}
                      onChange={(e) => setFastSync(e.target.checked)}
                      style={{ cursor: "pointer", width: "14px", height: "14px" }}
                    />
                    <label htmlFor="sync-fast" style={{ fontSize: "0.75rem", color: "var(--text-primary)", cursor: "pointer", userSelect: "none" }}>
                      <strong>Hızlı Senkronizasyon</strong> (WooCommerce ürünlerini önbelleğe alır ve değişmeyenleri atlar)
                    </label>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <input 
                      type="checkbox" 
                      id="sync-only-stock-price"
                      checked={syncOnlyStockPrice}
                      onChange={(e) => setSyncOnlyStockPrice(e.target.checked)}
                      style={{ cursor: "pointer", width: "14px", height: "14px" }}
                    />
                    <label htmlFor="sync-only-stock-price" style={{ fontSize: "0.75rem", color: "var(--text-primary)", cursor: "pointer", userSelect: "none" }}>
                      <strong>Sadece Stok ve Fiyat Güncelle</strong> (Açıklama, isim ve görselleri güncellemez; elle yapılan değişiklikleri korur)
                    </label>
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: "0.75rem" }}>Eş Zamanlı İstek Sayısı (Hız)</label>
                  <select 
                    className="form-select"
                    value={concurrency}
                    onChange={(e) => setConcurrency(parseInt(e.target.value, 10))}
                  >
                    <option value="1">1 (En Güvenli / Yavaş)</option>
                    <option value="3">3 (Normal)</option>
                    <option value="5">5 (Hızlı)</option>
                    <option value="10">10 (Çok Hızlı / Sunucuya Yük Bindirir)</option>
                  </select>
                </div>
              </div>

              {/* XML Dışı Ürün Ayarları (Temizlik) */}
              <div style={{ marginTop: "1rem", borderTop: "1px solid var(--border-color)", paddingTop: "1rem" }}>
                <label className="form-label" style={{ fontWeight: "600", color: "var(--accent-purple)", marginBottom: "0.5rem" }}>
                  XML Dışı Ürün Ayarları (Temizlik)
                </label>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.75rem", marginBottom: "0.75rem" }}>
                  XML dosyasında olmayan (tedarikçinin kaldırdığı) eski ürünler WooCommerce'de taranıp temizlenebilir.
                </p>
                
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: "0.75rem" }}>Temizleme Politikası</label>
                  <select 
                    className="form-select"
                    value={cleanupPolicy}
                    onChange={(e) => setCleanupPolicy(e.target.value)}
                  >
                    <option value="none">Yok (Eski Ürünleri Atla)</option>
                    <option value="stock">Stok Sıfırla (Out of Stock Yap - Önerilen)</option>
                    <option value="trash">Çöpe At (WooCommerce Çöp Kutusu)</option>
                    <option value="delete">Kalıcı Olarak Sil (Geri Alınamaz)</option>
                  </select>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Live sync controller panel */}
      {products.length > 0 && (
        <section className="glass-card pulse-card" style={{ padding: "1.75rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.25rem" }}>
            <Activity size={20} style={{ color: "var(--accent-indigo)" }} />
            <h2 style={{ fontSize: "1.2rem" }}>5. Senkronizasyon Konsolu ve Yönetimi</h2>
          </div>

          <div className="dashboard-grid">
            {/* Control stats & progress */}
            <div>
              {/* Stat Grid */}
              <div className="stat-grid">
                <div className="stat-card">
                  <div style={{ color: "var(--text-secondary)", fontSize: "0.75rem", fontWeight: "600" }}>TOPLAM</div>
                  <div className="stat-val" style={{ color: "var(--text-primary)" }}>{products.length}</div>
                </div>
                <div className="stat-card">
                  <div style={{ color: "var(--text-secondary)", fontSize: "0.75rem", fontWeight: "600" }}>İŞLENEN</div>
                  <div className="stat-val" style={{ color: "var(--accent-info)" }}>{currentIndex}</div>
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

              {/* Preloading Status */}
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

              {/* Temizlik Durumu */}
              {(isCleaning || cleanupStats.scanned > 0) && (
                <div style={{ marginBottom: "1.5rem", padding: "0.85rem", background: "rgba(168, 85, 247, 0.08)", border: "1px solid rgba(168, 85, 247, 0.25)", borderRadius: "var(--radius-md)", fontSize: "0.8rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "600", marginBottom: "0.5rem" }}>
                    <span style={{ color: "var(--accent-purple)", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <Activity size={12} className={isCleaning ? "pulse" : ""} />
                      {isCleaning ? "XML DIŞI ÜRÜN TEMİZLİĞİ AKTİF" : "TEMİZLİK BİTTİ"}
                    </span>
                    <span style={{ color: "var(--text-secondary)" }}>Sayfa {isCleaning ? cleanupPage : cleanupPage - 1} {cleanupTotalPages > 1 ? `/ ${cleanupTotalPages}` : ""}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem", textAlign: "center" }}>
                    <div style={{ background: "rgba(0,0,0,0.3)", padding: "0.5rem", borderRadius: "var(--radius-sm)" }}>
                      <div style={{ fontSize: "0.65rem", color: "var(--text-secondary)", fontWeight: "500" }}>TARANAN</div>
                      <div style={{ fontWeight: "700", fontSize: "1rem", marginTop: "0.15rem" }}>{cleanupStats.scanned}</div>
                    </div>
                    <div style={{ background: "rgba(0,0,0,0.3)", padding: "0.5rem", borderRadius: "var(--radius-sm)" }}>
                      <div style={{ fontSize: "0.65rem", color: "var(--accent-warning)", fontWeight: "500" }}>TEMİZLENEN</div>
                      <div style={{ fontWeight: "700", fontSize: "1rem", color: "var(--accent-warning)", marginTop: "0.15rem" }}>{cleanupStats.updated}</div>
                    </div>
                    <div style={{ background: "rgba(0,0,0,0.3)", padding: "0.5rem", borderRadius: "var(--radius-sm)" }}>
                      <div style={{ fontSize: "0.65rem", color: "var(--accent-danger)", fontWeight: "500" }}>HATA</div>
                      <div style={{ fontWeight: "700", fontSize: "1rem", color: "var(--accent-danger)", marginTop: "0.15rem" }}>{cleanupStats.errors}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem", flexWrap: "wrap" }}>
                {!isSyncing && !isCleaning ? (
                  <>
                    <button className="btn btn-primary" style={{ flex: 2 }} onClick={startSync}>
                      <Play size={16} /> Senkronizasyonu Başlat
                    </button>
                    {cleanupPolicy !== "none" && (
                      <button 
                        className="btn btn-secondary" 
                        style={{ flex: 1, borderColor: "var(--accent-purple)", color: "var(--accent-purple)" }}
                        onClick={startCleanup}
                      >
                        Temizliği Başlat
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    {isSyncing ? (
                      <>
                        {isPaused ? (
                          <button className="btn btn-primary" style={{ flex: 1 }} onClick={startSync}>
                            <Play size={16} /> Devam Et
                          </button>
                        ) : (
                          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={pauseSync}>
                            <Pause size={16} /> Duraklat
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        {isPaused ? (
                          <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setIsCleaning(true)}>
                            <Play size={16} /> Devam Et
                          </button>
                        ) : (
                          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setIsPaused(true)}>
                            <Pause size={16} /> Duraklat
                          </button>
                        )}
                      </>
                    )}
                  </>
                )}
                
                <button 
                  className="btn btn-secondary" 
                  onClick={resetSync} 
                  disabled={currentIndex === 0 && cleanupStats.scanned === 0 && !isSyncing && !isCleaning}
                >
                  <RotateCcw size={16} /> Sıfırla
                </button>
              </div>
            </div>

            {/* Live Terminal Log */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                  <Terminal size={14} />
                  <span>Canlı İşlem Logları</span>
                </div>
                {logs.length > 0 && (
                  <button 
                    style={{ background: "none", border: "none", color: "var(--accent-danger)", fontSize: "0.75rem", cursor: "pointer" }}
                    onClick={() => setLogs([])}
                  >
                    Temizle
                  </button>
                )}
              </div>
              <div className="terminal-console" ref={consoleRef}>
                {logs.length === 0 ? (
                  <div className="terminal-line line-muted">
                    Senkronizasyon başlatıldığında işlem detayları burada anlık olarak akacaktır.
                  </div>
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

      {/* Product Search & Comparison Section */}
      {products.length > 0 && (
        <section className="glass-card" style={{ marginTop: "1.5rem", padding: "1.75rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.25rem" }}>
            <Search size={20} style={{ color: "var(--accent-indigo)" }} />
            <h2 style={{ fontSize: "1.2rem" }}>6. XML ve WooCommerce Ürün Karşılaştırma & Sorgulama</h2>
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
      )}
    </div>
  );
}
