"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  ShoppingBag, 
  TrendingUp, 
  Eye, 
  Volume2, 
  VolumeX, 
  RefreshCw, 
  Clock, 
  CheckCircle,
  Copy,
  Check,
  AlertTriangle,
  ArrowLeft
} from "lucide-react";
import { useApp } from "../../context/AppContext";

interface OrderItem {
  name: string;
  quantity: number;
  sku: string;
  price: number;
}

interface Order {
  id: number;
  number: string;
  status: string;
  date_created: string;
  total: string;
  billing: {
    first_name: string;
    last_name: string;
  };
  line_items: OrderItem[];
}

interface OrderTotalReport {
  slug: string;
  name: string;
  total: number;
}

const phpSnippet = `// 1. Ürün tekil sayfaları yüklendiğinde ziyaret sayacını arttır (Gelişmiş ve Sayfa Yapıcılardan Bağımsız Yöntem)
add_action('template_redirect', 'setifera_save_product_views_robust');
function setifera_save_product_views_robust() {
    if (is_product() && is_single()) {
        $product_id = get_the_ID();
        if ($product_id) {
            $count = (int) get_post_meta($product_id, 'product_visit_count', true);
            update_post_meta($product_id, 'product_visit_count', $count + 1);
        }
    }
}

// 2. Sayfa ziyaret sayılarını WooCommerce REST API çıktısına dahil et
add_filter('woocommerce_rest_prepare_product_object', 'setifera_add_views_to_rest', 10, 3);
function setifera_add_views_to_rest($response, $object, $request) {
    $data = $response->get_data();
    $data['visit_count'] = (int) get_post_meta($object->get_id(), 'product_visit_count', true);
    $response->set_data($data);
    return $response;
}

// 3. REST API'nin 'visit_count' parametresini geçerli bir 'orderby' değeri olarak kabul etmesini sağla (ÇOK ÖNEMLİ)
add_filter('woocommerce_rest_product_collection_params', 'setifera_register_visit_count_orderby', 10, 1);
function setifera_register_visit_count_orderby($params) {
    if (isset($params['orderby']['enum'])) {
        $params['orderby']['enum'][] = 'visit_count';
    }
    return $params;
}

// 4. REST API'de visit_count parametresine göre sıralama desteği ekle
add_filter('woocommerce_rest_product_object_query', 'setifera_add_views_orderby_to_rest', 10, 2);
function setifera_add_views_orderby_to_rest($args, $request) {
    if (isset($request['orderby']) && $request['orderby'] === 'visit_count') {
        $args['meta_key'] = 'product_visit_count';
        $args['orderby'] = 'meta_value_num';
    }
    return $args;
}`;

export default function OrdersPage() {
  const { wooUrl, consumerKey, consumerSecret } = useApp();

  // Active/Live Orders States
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshCountdown, setRefreshCountdown] = useState(60);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);

  // Status Filtering States (Historical)
  const [orderTotals, setOrderTotals] = useState<OrderTotalReport[]>([]);
  const [isLoadingTotals, setIsLoadingTotals] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  const [isLoadingFilteredOrders, setIsLoadingFilteredOrders] = useState(false);

  // Stats States
  const [popularProducts, setPopularProducts] = useState<any[]>([]);
  const [viewedProducts, setViewedProducts] = useState<any[]>([]);
  const [isStatsLoading, setIsStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState("");
  const [viewsTrackingActive, setViewsTrackingActive] = useState(false);

  // Copy status
  const [copied, setCopied] = useState(false);

  // Debug stats state
  const [statsDebug, setStatsDebug] = useState<any>(null);
  const [showDebugPanel, setShowDebugPanel] = useState(false);

  // Keep track of order IDs to detect new orders
  const seenOrderIdsRef = useRef<Set<number>>(new Set());

  // Web Audio API Pleasant Notification Chime
  const playNotificationSound = () => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const now = audioCtx.currentTime;
      
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(659.25, now);
      gain1.gain.setValueAtTime(0.08, now);
      gain1.gain.exponentialRampToValueAtTime(0.00001, now + 0.3);
      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 0.3);

      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(880.00, now + 0.12);
      gain2.gain.setValueAtTime(0.08, now + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.00001, now + 0.45);
      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.45);
    } catch (e) {
      console.error("Audio chime playback failed:", e);
    }
  };

  // Fetch active orders from API
  const fetchActiveOrders = async (isFirstLoad = false) => {
    if (!wooUrl || !consumerKey || !consumerSecret) {
      setOrdersError("WooCommerce API bağlantı bilgileri eksik.");
      return;
    }

    setIsLoadingOrders(true);
    setOrdersError("");

    try {
      const response = await fetch("/api/woo-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wooConfig: { url: wooUrl, consumerKey, consumerSecret },
          status: "processing,pending",
          perPage: 50
        })
      });

      const data = await response.json();
      if (data.success) {
        const fetchedOrders: Order[] = data.orders || [];
        
        let newOrderDetected = false;
        fetchedOrders.forEach(order => {
          if (seenOrderIdsRef.current.size > 0 && !seenOrderIdsRef.current.has(order.id)) {
            newOrderDetected = true;
          }
          seenOrderIdsRef.current.add(order.id);
        });

        if (isFirstLoad) {
          fetchedOrders.forEach(order => seenOrderIdsRef.current.add(order.id));
        }

        if (newOrderDetected) {
          playNotificationSound();
        }

        setOrders(fetchedOrders);
      } else {
        setOrdersError(data.error || "Aktif siparişler çekilemedi.");
      }
    } catch (err: any) {
      setOrdersError(`Siparişler bağlantı hatası: ${err.message || err}`);
    } finally {
      setIsLoadingOrders(false);
    }
  };

  // Fetch order report totals
  const fetchOrderTotals = async () => {
    if (!wooUrl || !consumerKey || !consumerSecret) return;
    setIsLoadingTotals(true);
    try {
      const response = await fetch("/api/woo-orders-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wooConfig: { url: wooUrl, consumerKey, consumerSecret }
        })
      });
      const data = await response.json();
      if (data.success) {
        setOrderTotals(data.totals || []);
      }
    } catch (err) {
      console.error("Order totals report fetch error:", err);
    } finally {
      setIsLoadingTotals(false);
    }
  };

  // Fetch filtered historical orders by status
  const fetchFilteredOrders = async (status: string) => {
    if (!wooUrl || !consumerKey || !consumerSecret) return;
    setIsLoadingFilteredOrders(true);
    setOrdersError("");
    try {
      const response = await fetch("/api/woo-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wooConfig: { url: wooUrl, consumerKey, consumerSecret },
          status,
          perPage: 20
        })
      });
      const data = await response.json();
      if (data.success) {
        setFilteredOrders(data.orders || []);
      } else {
        setOrdersError(data.error || "Filtrelenmiş siparişler çekilemedi.");
      }
    } catch (err: any) {
      setOrdersError(`Filtre bağlantı hatası: ${err.message || err}`);
    } finally {
      setIsLoadingFilteredOrders(false);
    }
  };

  // Fetch product analytics
  const fetchProductStats = async () => {
    if (!wooUrl || !consumerKey || !consumerSecret) {
      setStatsError("WooCommerce API bağlantı bilgileri eksik.");
      return;
    }

    setIsStatsLoading(true);
    setStatsError("");

    try {
      const response = await fetch("/api/woo-stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wooConfig: { url: wooUrl, consumerKey, consumerSecret }
        })
      });

      const data = await response.json();
      if (data.success) {
        setPopularProducts(data.popularProducts || []);
        setViewedProducts(data.viewedProducts || []);
        setViewsTrackingActive(data.viewsTrackingActive || false);
        setStatsDebug(data.viewDebug || null);
      } else {
        setStatsError(data.error || "İstatistikler yüklenemedi.");
        setStatsDebug(data);
      }
    } catch (err: any) {
      setStatsError(`İstatistikler bağlantı hatası: ${err.message || err}`);
      setStatsDebug({ exception: err.message || String(err) });
    } finally {
      setIsStatsLoading(false);
    }
  };

  // Fetch initial data
  useEffect(() => {
    fetchActiveOrders(true);
    fetchOrderTotals();
    fetchProductStats();
  }, [wooUrl, consumerKey, consumerSecret]);

  // Handle countdown polling refresh loop
  useEffect(() => {
    if (!autoRefresh || selectedStatus !== null) return;

    const interval = setInterval(() => {
      setRefreshCountdown(prev => {
        if (prev <= 1) {
          fetchActiveOrders(false);
          fetchOrderTotals();
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [autoRefresh, selectedStatus, wooUrl, consumerKey, consumerSecret]);

  // Handle card click
  const handleStatusCardClick = (status: string) => {
    setSelectedStatus(status);
    fetchFilteredOrders(status);
    setExpandedOrderId(null);
  };

  // Clear filter
  const handleClearFilter = () => {
    setSelectedStatus(null);
    setFilteredOrders([]);
    setExpandedOrderId(null);
    fetchActiveOrders(false);
    fetchOrderTotals();
  };

  // Copy code helper
  const handleCopyCode = () => {
    navigator.clipboard.writeText(phpSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getStatusTotalCount = (slug: string) => {
    const found = orderTotals.find((t: any) => t.slug === slug);
    return found ? found.total : 0;
  };

  const statusConfig: Record<string, { label: string; color: string; bg: string; border: string }> = {
    completed: { label: "Tamamlanan", color: "var(--accent-success)", bg: "rgba(16, 185, 129, 0.08)", border: "rgba(16, 185, 129, 0.2)" },
    processing: { label: "Hazırlanan", color: "var(--accent-info)", bg: "rgba(14, 165, 233, 0.08)", border: "rgba(14, 165, 233, 0.2)" },
    pending: { label: "Bekleyen", color: "var(--accent-warning)", bg: "rgba(245, 158, 11, 0.08)", border: "rgba(245, 158, 11, 0.2)" },
    cancelled: { label: "İptal Edilen", color: "var(--accent-danger)", bg: "rgba(239, 68, 68, 0.08)", border: "rgba(239, 68, 68, 0.2)" },
    refunded: { label: "İade Edilen", color: "var(--accent-purple)", bg: "rgba(168, 85, 247, 0.08)", border: "rgba(168, 85, 247, 0.2)" },
    failed: { label: "Başarısız", color: "#f87171", bg: "rgba(248, 113, 113, 0.08)", border: "rgba(248, 113, 113, 0.2)" },
  };

  return (
    <div className="app-container" style={{ padding: 0 }}>
      {/* Header */}
      <header style={{ marginBottom: "2rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 className="text-gradient" style={{ fontSize: "2.2rem", fontWeight: "800" }}>Siparişler & Analizler</h1>
          <p style={{ color: "var(--text-secondary)", marginTop: "0.25rem", fontSize: "0.95rem" }}>
            Mağazanıza düşen son siparişleri anlık izleyin, durum özetlerini filtreleyin ve ürün satış/izlenme analizlerini inceleyin.
          </p>
        </div>
        
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          {wooUrl ? (
            <span className="badge badge-success" style={{ padding: "0.5rem 0.8rem", gap: "0.4rem" }}>
              <CheckCircle size={14} />
              BAĞLI: {new URL(wooUrl.startsWith("http") ? wooUrl : "https://" + wooUrl).hostname}
            </span>
          ) : (
            <span className="badge badge-danger" style={{ padding: "0.5rem 0.8rem" }}>
              BAĞLANTI YOK
            </span>
          )}
        </div>
      </header>

      {/* Order Status Cards Grid */}
      <section style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem" }}>
          {Object.keys(statusConfig).map((statusKey) => {
            const config = statusConfig[statusKey];
            const count = getStatusTotalCount(statusKey);
            const isSelected = selectedStatus === statusKey;
            
            return (
              <div 
                key={statusKey}
                onClick={() => handleStatusCardClick(statusKey)}
                style={{
                  background: config.bg,
                  border: `1px solid ${isSelected ? config.color : config.border}`,
                  borderRadius: "var(--radius-md)",
                  padding: "1.25rem 1rem",
                  cursor: "pointer",
                  transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                  boxShadow: isSelected ? `0 0 15px ${config.color}33` : "none",
                  transform: isSelected ? "translateY(-2px)" : "none",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: "100px"
                }}
                className="status-card-hover"
              >
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "600", letterSpacing: "0.02em" }}>{config.label.toUpperCase()}</span>
                <span style={{ fontSize: "2rem", fontWeight: "800", color: config.color, marginTop: "0.25rem", fontFamily: "var(--font-title)" }}>
                  {isLoadingTotals ? "..." : count.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Dynamic Orders List Section */}
      <section className="glass-card" style={{ marginBottom: "1.5rem" }}>
        {selectedStatus === null ? (
          /* LIVE ACTIVE ORDERS VIEW */
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <ShoppingBag size={20} style={{ color: "var(--accent-indigo)" }} />
                <h2 style={{ fontSize: "1.2rem" }}>Aktif Sipariş Takip Paneli (Canlı)</h2>
              </div>
              
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", background: "rgba(255,255,255,0.03)", padding: "0.4rem 0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)", fontSize: "0.8rem" }}>
                  <Clock size={12} style={{ color: autoRefresh ? "var(--accent-success)" : "var(--text-muted)" }} />
                  {autoRefresh ? (
                    <span>Otomatik Yenileme: {refreshCountdown}sn</span>
                  ) : (
                    <span>Otomatik Yenileme Kapalı</span>
                  )}
                  <input 
                    type="checkbox" 
                    checked={autoRefresh} 
                    onChange={(e) => {
                      setAutoRefresh(e.target.checked);
                      setRefreshCountdown(60);
                    }} 
                    style={{ marginLeft: "0.25rem", cursor: "pointer" }}
                  />
                </div>

                <button 
                  className="btn btn-secondary" 
                  style={{ padding: "0.4rem 0.75rem", fontSize: "0.8rem", height: "30px" }}
                  onClick={() => setSoundEnabled(!soundEnabled)}
                >
                  {soundEnabled ? (
                    <>
                      <Volume2 size={14} style={{ color: "var(--accent-indigo)" }} /> Ses Açık
                    </>
                  ) : (
                    <>
                      <VolumeX size={14} style={{ color: "var(--text-muted)" }} /> Ses Kapalı
                    </>
                  )}
                </button>

                <button 
                  className="btn btn-primary" 
                  style={{ padding: "0.4rem 0.75rem", fontSize: "0.8rem", height: "30px" }}
                  onClick={() => {
                    fetchActiveOrders(false);
                    fetchOrderTotals();
                  }}
                  disabled={isLoadingOrders}
                >
                  <RefreshCw size={14} className={isLoadingOrders ? "spin-animation" : ""} /> Yenile
                </button>
              </div>
            </div>

            {ordersError && (
              <div style={{ padding: "1rem", background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.25)", borderRadius: "var(--radius-md)", color: "var(--accent-danger)", fontSize: "0.85rem", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <AlertTriangle size={16} />
                <span>{ordersError}</span>
              </div>
            )}

            {orders.length === 0 ? (
              <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--text-muted)", fontSize: "0.9rem" }}>
                {isLoadingOrders ? <p>Aktif siparişler taranıyor...</p> : <p>Şu an WooCommerce mağazanızda işlenmeyi bekleyen aktif sipariş (Ödeme bekliyor / Hazırlanıyor) bulunmuyor.</p>}
              </div>
            ) : (
              <OrdersTable ordersList={orders} expandedId={expandedOrderId} setExpandedId={setExpandedOrderId} />
            )}
          </>
        ) : (
          /* FILTERED HISTORICAL ORDERS VIEW */
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: "0.3rem 0.6rem", fontSize: "0.8rem", height: "30px" }}
                  onClick={handleClearFilter}
                >
                  <ArrowLeft size={14} /> Geri (Aktif Siparişler)
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <ShoppingBag size={20} style={{ color: statusConfig[selectedStatus].color }} />
                  <h2 style={{ fontSize: "1.2rem" }}>
                    {statusConfig[selectedStatus].label} Siparişler (Son 20)
                  </h2>
                </div>
              </div>
              
              <button 
                className="btn btn-primary" 
                style={{ padding: "0.4rem 0.75rem", fontSize: "0.8rem", height: "30px" }}
                onClick={() => fetchFilteredOrders(selectedStatus)}
                disabled={isLoadingFilteredOrders}
              >
                <RefreshCw size={14} className={isLoadingFilteredOrders ? "spin-animation" : ""} /> Listeyi Yenile
              </button>
            </div>

            {ordersError && (
              <div style={{ padding: "1rem", background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.25)", borderRadius: "var(--radius-md)", color: "var(--accent-danger)", fontSize: "0.85rem", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <AlertTriangle size={16} />
                <span>{ordersError}</span>
              </div>
            )}

            {filteredOrders.length === 0 ? (
              <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--text-muted)", fontSize: "0.9rem" }}>
                {isLoadingFilteredOrders ? <p>Siparişler sorgulanıyor...</p> : <p>Bu statüde kayıtlı sipariş bulunamadı.</p>}
              </div>
            ) : (
              <OrdersTable ordersList={filteredOrders} expandedId={expandedOrderId} setExpandedId={setExpandedOrderId} />
            )}
          </>
        )}
      </section>

      {/* Grid: Popular and viewed products */}
      <div className="dashboard-grid" style={{ marginBottom: "1.5rem" }}>
        {/* Popular products */}
        <section className="glass-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <TrendingUp size={20} style={{ color: "var(--accent-success)" }} />
              <h2 style={{ fontSize: "1.2rem" }}>En Çok Satan Ürünler (Top 10)</h2>
            </div>
            <button className="btn btn-secondary" style={{ padding: "0.3rem 0.6rem", fontSize: "0.75rem" }} onClick={fetchProductStats} disabled={isStatsLoading}>Yenile</button>
          </div>

          {statsError && <p style={{ fontSize: "0.8rem", color: "var(--accent-danger)", marginBottom: "0.5rem" }}>{statsError}</p>}

          {popularProducts.length === 0 ? (
            <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", textAlign: "center", padding: "2rem" }}>
              {isStatsLoading ? "Veriler çekiliyor..." : "Satış verisi bulunan popüler ürün listelenemedi."}
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-color)", color: "var(--text-secondary)", textAlign: "left" }}>
                    <th style={{ padding: "0.5rem 0.25rem" }}>Ürün</th>
                    <th style={{ padding: "0.5rem 0.25rem" }}>SKU</th>
                    <th style={{ padding: "0.5rem 0.25rem", textAlign: "right" }}>Satış (Adet)</th>
                  </tr>
                </thead>
                <tbody>
                  {popularProducts.map((prod) => (
                    <tr key={prod.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.02)" }}>
                      <td style={{ padding: "0.5rem 0.25rem", maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: "500" }} title={prod.name}>{prod.name}</td>
                      <td style={{ padding: "0.5rem 0.25rem", color: "var(--text-muted)" }}>{prod.sku || "-"}</td>
                      <td style={{ padding: "0.5rem 0.25rem", textAlign: "right", fontWeight: "700", color: "var(--accent-success)" }}>{prod.total_sales} adet</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Viewed products */}
        <section className="glass-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Eye size={20} style={{ color: "var(--accent-info)" }} />
              <h2 style={{ fontSize: "1.2rem" }}>En Çok İncelenen Ürünler (Top 10)</h2>
            </div>
            <button className="btn btn-secondary" style={{ padding: "0.3rem 0.6rem", fontSize: "0.75rem" }} onClick={fetchProductStats} disabled={isStatsLoading}>Yenile</button>
          </div>

          {!viewsTrackingActive && (
            <div style={{ marginBottom: "1rem", padding: "0.75rem", background: "var(--accent-warning-bg)", border: "1px solid var(--accent-warning)", borderRadius: "var(--radius-md)", fontSize: "0.75rem", color: "var(--text-primary)" }}>
              <p><strong>İzleme Kodu Aktif Değil:</strong> Ürün sayfa ziyaretleri henüz sayılmıyor. Saydırmayı başlatmak için aşağıdaki entegrasyon kodunu WordPress sitenize eklemelisiniz.</p>
              
              {statsDebug && (
                <div style={{ marginTop: "0.5rem" }}>
                  <button 
                    className="btn btn-secondary" 
                    style={{ padding: "0.2rem 0.4rem", fontSize: "0.7rem", height: "auto" }}
                    onClick={() => setShowDebugPanel(!showDebugPanel)}
                  >
                    {showDebugPanel ? "Bağlantı Detaylarını Gizle" : "Bağlantı Detaylarını Göster (Hata Ayıklama)"}
                  </button>
                  {showDebugPanel && (
                    <pre style={{ 
                      marginTop: "0.5rem", 
                      padding: "0.5rem", 
                      background: "rgba(0,0,0,0.4)", 
                      borderRadius: "var(--radius-sm)", 
                      fontSize: "0.7rem", 
                      overflowX: "auto",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all"
                    }}>
                      {JSON.stringify(statsDebug, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}

          {viewedProducts.length === 0 ? (
            <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", textAlign: "center", padding: "2rem" }}>
              {isStatsLoading ? "Veriler çekiliyor..." : "Ziyaret verisi bulunan incelenen ürün listelenemedi."}
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-color)", color: "var(--text-secondary)", textAlign: "left" }}>
                    <th style={{ padding: "0.5rem 0.25rem" }}>Ürün</th>
                    <th style={{ padding: "0.5rem 0.25rem" }}>SKU</th>
                    <th style={{ padding: "0.5rem 0.25rem", textAlign: "right" }}>Görüntüleme</th>
                  </tr>
                </thead>
                <tbody>
                  {viewedProducts.map((prod) => (
                    <tr key={prod.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.02)" }}>
                      <td style={{ padding: "0.5rem 0.25rem", maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: "500" }} title={prod.name}>{prod.name}</td>
                      <td style={{ padding: "0.5rem 0.25rem", color: "var(--text-muted)" }}>{prod.sku || "-"}</td>
                      <td style={{ padding: "0.5rem 0.25rem", textAlign: "right", fontWeight: "700", color: "var(--accent-info)" }}>{prod.visit_count} gösterim</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Integration Code Guide */}
      <section className="glass-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2 style={{ fontSize: "1.1rem" }}>WordPress En Çok İncelenenler Entegrasyon Rehberi</h2>
          <button 
            className="btn btn-secondary" 
            style={{ padding: "0.25rem 0.6rem", fontSize: "0.75rem", gap: "0.25rem" }}
            onClick={handleCopyCode}
          >
            {copied ? (
              <>
                <Check size={12} style={{ color: "var(--accent-success)" }} /> Kopyalandı
              </>
            ) : (
              <>
                <Copy size={12} /> Kodu Kopyala
              </>
            )}
          </button>
        </div>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.8rem", marginBottom: "1rem" }}>
          Sitenizdeki ürün sayfa görüntülenmelerini saydırmak ve bu panelde listelemek için aşağıdaki PHP kodu temanızın <strong>functions.php</strong> dosyasına eklenmelidir:
        </p>
        <pre style={{ 
          background: "#05070c", 
          padding: "1rem", 
          borderRadius: "var(--radius-md)", 
          fontSize: "0.75rem", 
          fontFamily: "var(--font-mono)", 
          overflowX: "auto", 
          maxHeight: "250px", 
          color: "#34d399",
          border: "1px solid var(--border-color)",
          lineHeight: "1.4"
        }}>
          {phpSnippet}
        </pre>
      </section>
    </div>
  );
}

// Sub-component for Orders Table rendering to avoid duplicates
function OrdersTable({ 
  ordersList, 
  expandedId, 
  setExpandedId 
}: { 
  ordersList: Order[]; 
  expandedId: number | null; 
  setExpandedId: (id: number | null) => void 
}) {
  const statusLabels: Record<string, string> = {
    completed: "Tamamlandı",
    processing: "İşleniyor",
    pending: "Ödeme Bekliyor",
    cancelled: "İptal Edildi",
    refunded: "İade Edildi",
    failed: "Başarısız"
  };

  const statusBadges: Record<string, string> = {
    completed: "badge-success",
    processing: "badge-info",
    pending: "badge-warning",
    cancelled: "badge-danger",
    refunded: "badge-purple",
    failed: "badge-danger"
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="compare-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: "left" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid var(--border-color)", color: "var(--text-secondary)" }}>
            <th style={{ padding: "0.75rem 0.5rem" }}>SİPARİŞ NO</th>
            <th style={{ padding: "0.75rem 0.5rem" }}>MÜŞTERİ</th>
            <th style={{ padding: "0.75rem 0.5rem" }}>TARİH</th>
            <th style={{ padding: "0.75rem 0.5rem" }}>DURUM</th>
            <th style={{ padding: "0.75rem 0.5rem", textAlign: "right" }}>TOPLAM TUTAR</th>
            <th style={{ padding: "0.75rem 0.5rem", textAlign: "center" }}>DETAY</th>
          </tr>
        </thead>
        <tbody>
          {ordersList.map((order) => {
            const isExpanded = expandedId === order.id;
            const dateStr = new Date(order.date_created).toLocaleString("tr-TR");
            const badgeClass = statusBadges[order.status] || "badge-secondary";
            const label = statusLabels[order.status] || order.status;

            return (
              <React.Fragment key={order.id}>
                <tr style={{ borderBottom: "1px solid var(--border-color)", background: isExpanded ? "rgba(255, 255, 255, 0.02)" : "transparent" }}>
                  <td style={{ padding: "0.75rem 0.5rem", fontWeight: "700", color: "var(--accent-indigo)" }}>#{order.number}</td>
                  <td style={{ padding: "0.75rem 0.5rem", fontWeight: "500" }}>{order.billing.first_name} {order.billing.last_name}</td>
                  <td style={{ padding: "0.75rem 0.5rem", color: "var(--text-secondary)" }}>{dateStr}</td>
                  <td style={{ padding: "0.75rem 0.5rem" }}>
                    <span className={`badge ${badgeClass}`}>
                      {label}
                    </span>
                  </td>
                  <td style={{ padding: "0.75rem 0.5rem", textAlign: "right", fontWeight: "700", color: "var(--accent-success)" }}>{parseFloat(order.total).toFixed(2)} TL</td>
                  <td style={{ padding: "0.75rem 0.5rem", textAlign: "center" }}>
                    <button 
                      className="btn btn-secondary" 
                      style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                      onClick={() => setExpandedId(isExpanded ? null : order.id)}
                    >
                      {isExpanded ? "Gizle" : "Ürünleri Gör"}
                    </button>
                  </td>
                </tr>
                
                {isExpanded && (
                  <tr>
                    <td colSpan={6} style={{ padding: "1rem", background: "rgba(0,0,0,0.25)", borderBottom: "1px solid var(--border-color)" }}>
                      <div style={{ paddingLeft: "1rem" }}>
                        <h4 style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>Sipariş İçeriği:</h4>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                          {order.line_items.map((item, idx) => (
                            <div key={idx} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed rgba(255,255,255,0.05)", paddingBottom: "0.25rem", fontSize: "0.8rem" }}>
                              <div>
                                <span style={{ fontWeight: "700", marginRight: "0.5rem" }}>{item.quantity}x</span>
                                <span style={{ color: "var(--text-primary)" }}>{item.name}</span>
                                {item.sku && <span style={{ color: "var(--text-muted)", marginLeft: "0.5rem", fontSize: "0.75rem" }}>({item.sku})</span>}
                              </div>
                              <span style={{ fontWeight: "600" }}>{parseFloat(String(item.price * item.quantity)).toFixed(2)} TL</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
