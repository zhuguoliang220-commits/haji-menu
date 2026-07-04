"use client";

import { ChangeEvent, FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  Camera,
  CheckCircle2,
  ChefHat,
  ClipboardList,
  Cloud,
  Heart,
  Loader2,
  LogOut,
  Minus,
  Plus,
  Power,
  RefreshCw,
  Send,
  Sparkles,
  Store
} from "lucide-react";
import { Dish, NewOrder, ORDER_STATUSES, Order, OrderStatus, PEOPLE, SessionChoice } from "@/lib/types";

type CartItem = {
  dish: Dish;
  quantity: number;
  note: string;
};

const sessionKey = "haji-menu-session";
const accessKey = "haji-menu-access";
const localDishesKey = "haji-menu-local-dishes";
const localOrdersKey = "haji-menu-local-orders";
const configuredAccessCode = process.env.NEXT_PUBLIC_APP_ACCESS_CODE || "haji-love";

function nowIso() {
  return new Date().toISOString();
}

function localId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const value = window.localStorage.getItem(key);
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function writeLocal<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event("haji-local-sync"));
}

async function apiFetch<T>(path: string, accessCode: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("x-app-code", accessCode);
  if (!(init?.body instanceof FormData)) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(path, {
    ...init,
    headers
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "请求失败");
  }

  return response.json() as Promise<T>;
}

export default function Home() {
  const [accessCode, setAccessCode] = useState("");
  const [accessGranted, setAccessGranted] = useState(false);
  const [session, setSession] = useState<SessionChoice | null>(null);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [dishName, setDishName] = useState("");
  const [dishFile, setDishFile] = useState<File | null>(null);
  const [dishPreview, setDishPreview] = useState("");
  const [isSavingDish, setIsSavingDish] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [notice, setNotice] = useState("欢迎进入点菜舱");
  const [backendMode, setBackendMode] = useState<"supabase" | "local">("supabase");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const isChef = session?.role === "chef";
  const activeDishes = useMemo(() => dishes.filter((dish) => dish.is_active), [dishes]);
  const chefOrders = orders;
  const myOrders = useMemo(
    () => orders.filter((order) => order.customer_name === session?.person),
    [orders, session?.person]
  );

  const loadData = useCallback(
    async (code = accessCode) => {
      if (!code) return;

      setIsRefreshing(true);
      try {
        const [dishResult, orderResult] = await Promise.all([
          apiFetch<{ dishes: Dish[] }>("/api/dishes", code),
          apiFetch<{ orders: Order[] }>("/api/orders", code)
        ]);
        setDishes(dishResult.dishes);
        setOrders(orderResult.orders);
        setBackendMode("supabase");
      } catch {
        setBackendMode("local");
        setDishes(readLocal<Dish[]>(localDishesKey, []));
        setOrders(readLocal<Order[]>(localOrdersKey, []));
      } finally {
        setIsRefreshing(false);
      }
    },
    [accessCode]
  );

  useEffect(() => {
    const storedCode = window.localStorage.getItem(accessKey);
    const storedSession = readLocal<SessionChoice | null>(sessionKey, null);

    if (storedCode) {
      setAccessCode(storedCode);
      setAccessGranted(true);
      void loadData(storedCode);
    }

    if (storedSession) setSession(storedSession);
  }, [loadData]);

  useEffect(() => {
    if (!accessGranted || !accessCode) return;

    const interval = window.setInterval(() => {
      void loadData(accessCode);
    }, 5000);

    const syncLocal = () => {
      if (backendMode === "local") {
        setDishes(readLocal<Dish[]>(localDishesKey, []));
        setOrders(readLocal<Order[]>(localOrdersKey, []));
      }
    };

    window.addEventListener("haji-local-sync", syncLocal);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("haji-local-sync", syncLocal);
    };
  }, [accessCode, accessGranted, backendMode, loadData]);

  useEffect(() => {
    if (!dishFile) {
      setDishPreview("");
      return;
    }

    const url = URL.createObjectURL(dishFile);
    setDishPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [dishFile]);

  function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (accessCode.trim() !== configuredAccessCode) {
      setNotice("访问码不对，点菜舱还在休眠");
      return;
    }

    window.localStorage.setItem(accessKey, accessCode.trim());
    setAccessGranted(true);
    setNotice("访问码确认，选择今天的身份吧");
    void loadData(accessCode.trim());
  }

  function chooseSession(choice: SessionChoice) {
    setSession(choice);
    writeLocal(sessionKey, choice);
    setNotice(`${choice.person} 已进入${choice.role === "chef" ? "厨师台" : "点餐台"}`);
  }

  function logout() {
    window.localStorage.removeItem(sessionKey);
    setSession(null);
    setCart([]);
    setNotice("已退回身份选择");
  }

  async function uploadImage(file: File) {
    if (backendMode === "local") {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("读取图片失败"));
        reader.readAsDataURL(file);
      });
    }

    const formData = new FormData();
    formData.append("file", file);
    const result = await apiFetch<{ url: string }>("/api/upload", accessCode, {
      method: "POST",
      body: formData
    });
    return result.url;
  }

  async function saveDish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !dishName.trim() || !dishFile) {
      setNotice("菜名和图片都要有，厨师台才会亮起来");
      return;
    }

    setIsSavingDish(true);
    try {
      const imageUrl = await uploadImage(dishFile);

      if (backendMode === "local") {
        const nextDish: Dish = {
          id: localId("dish"),
          name: dishName.trim(),
          image_url: imageUrl,
          created_by: session.person,
          is_active: true,
          created_at: nowIso()
        };
        const nextDishes = [nextDish, ...dishes];
        setDishes(nextDishes);
        writeLocal(localDishesKey, nextDishes);
      } else {
        await apiFetch<{ dish: Dish }>("/api/dishes", accessCode, {
          method: "POST",
          body: JSON.stringify({
            name: dishName,
            image_url: imageUrl,
            created_by: session.person
          })
        });
        await loadData();
      }

      setDishName("");
      setDishFile(null);
      setNotice("新菜上架成功，对方刷新后就能看到");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "上架失败");
    } finally {
      setIsSavingDish(false);
    }
  }

  async function toggleDish(dish: Dish) {
    const nextActive = !dish.is_active;
    if (backendMode === "local") {
      const nextDishes = dishes.map((item) => (item.id === dish.id ? { ...item, is_active: nextActive } : item));
      setDishes(nextDishes);
      writeLocal(localDishesKey, nextDishes);
      return;
    }

    await apiFetch<{ dish: Dish }>(`/api/dishes/${dish.id}`, accessCode, {
      method: "PATCH",
      body: JSON.stringify({ is_active: nextActive })
    });
    await loadData();
  }

  function addToCart(dish: Dish) {
    setCart((items) => {
      const existing = items.find((item) => item.dish.id === dish.id);
      if (existing) {
        return items.map((item) =>
          item.dish.id === dish.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...items, { dish, quantity: 1, note: "" }];
    });
    setNotice(`${dish.name} 已加入今日菜单`);
  }

  function updateCart(dishId: string, patch: Partial<CartItem>) {
    setCart((items) =>
      items
        .map((item) => (item.dish.id === dishId ? { ...item, ...patch } : item))
        .filter((item) => item.quantity > 0)
    );
  }

  async function submitOrders() {
    if (!session || cart.length === 0) return;

    setIsSubmittingOrder(true);
    try {
      const newOrders: NewOrder[] = cart.map((item) => ({
        customer_name: session.person,
        dish_id: item.dish.id,
        dish_name: item.dish.name,
        dish_image_url: item.dish.image_url,
        quantity: item.quantity,
        note: item.note
      }));

      if (backendMode === "local") {
        const created: Order[] = newOrders.map((order) => ({
          id: localId("order"),
          ...order,
          note: order.note?.trim() || null,
          status: "收到",
          created_at: nowIso(),
          updated_at: nowIso()
        }));
        const nextOrders = [...created, ...orders];
        setOrders(nextOrders);
        writeLocal(localOrdersKey, nextOrders);
      } else {
        await Promise.all(
          newOrders.map((order) =>
            apiFetch<{ order: Order }>("/api/orders", accessCode, {
              method: "POST",
              body: JSON.stringify(order)
            })
          )
        );
        await loadData();
      }

      setCart([]);
      setNotice("菜单已发送，厨师台会收到新订单");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "提交失败");
    } finally {
      setIsSubmittingOrder(false);
    }
  }

  async function updateOrderStatus(order: Order, status: OrderStatus) {
    if (backendMode === "local") {
      const nextOrders = orders.map((item) =>
        item.id === order.id ? { ...item, status, updated_at: nowIso() } : item
      );
      setOrders(nextOrders);
      writeLocal(localOrdersKey, nextOrders);
      return;
    }

    await apiFetch<{ order: Order }>(`/api/orders/${order.id}`, accessCode, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
    await loadData();
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    setDishFile(event.target.files?.[0] ?? null);
  }

  if (!accessGranted) {
    return (
      <main className="min-h-screen overflow-hidden px-5 py-8 text-slate-900">
        <AmbientDecor />
        <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col justify-center">
          <div className="mb-7 flex items-center justify-center">
            <Mascot label="Haji" />
          </div>
          <div className="glass-panel p-6 shadow-soft">
            <div className="mb-6 text-center">
              <p className="text-xs font-bold uppercase tracking-[0.32em] text-cyan-600">Private kitchen link</p>
              <h1 className="mt-3 text-3xl font-black text-slate-950">点菜舱启动</h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">输入你们的共享访问码，进入哈基工和哈吉梁的小小菜单宇宙。</p>
            </div>
            <form onSubmit={unlock} className="space-y-4">
              <label className="field-label" htmlFor="access-code">
                访问码
              </label>
              <input
                id="access-code"
                className="text-input"
                value={accessCode}
                onChange={(event) => setAccessCode(event.target.value)}
                placeholder="默认 haji-love，可在环境变量修改"
                type="password"
              />
              <button className="primary-button w-full" type="submit">
                <Power size={18} />
                开启点菜舱
              </button>
            </form>
          </div>
          <StatusPill mode={backendMode} text={notice} />
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="min-h-screen px-5 py-7 text-slate-900">
        <AmbientDecor />
        <section className="mx-auto w-full max-w-5xl">
          <TopBar
            title="选择今天的身份"
            subtitle="每个人都可以独立成为厨师或顾客"
            notice={notice}
            mode={backendMode}
            onRefresh={() => loadData()}
            isRefreshing={isRefreshing}
          />
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {PEOPLE.map((person) => (
              <div key={person} className="glass-panel p-5">
                <div className="flex items-center gap-4">
                  <Mascot label={person.slice(-1)} compact />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-pink-500">Profile</p>
                    <h2 className="text-2xl font-black text-slate-950">{person}</h2>
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <button className="role-button" onClick={() => chooseSession({ person, role: "chef" })}>
                    <ChefHat size={22} />
                    今天当厨师
                  </button>
                  <button className="role-button" onClick={() => chooseSession({ person, role: "customer" })}>
                    <ClipboardList size={22} />
                    今天当顾客
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-5 text-slate-900 sm:px-6 lg:px-8">
      <AmbientDecor />
      <section className="mx-auto w-full max-w-7xl">
        <TopBar
          title={isChef ? "厨师台在线" : "顾客点餐台"}
          subtitle={`${session.person} / ${isChef ? "今天掌勺" : "今天点餐"}`}
          notice={notice}
          mode={backendMode}
          onRefresh={() => loadData()}
          isRefreshing={isRefreshing}
          action={
            <button className="ghost-button" onClick={logout}>
              <LogOut size={17} />
              换身份
            </button>
          }
        />

        {isChef ? (
          <ChefDashboard
            dishes={dishes}
            orders={chefOrders}
            dishName={dishName}
            dishPreview={dishPreview}
            isSavingDish={isSavingDish}
            onDishNameChange={setDishName}
            onFileChange={onFileChange}
            onSaveDish={saveDish}
            onToggleDish={toggleDish}
            onUpdateOrderStatus={updateOrderStatus}
          />
        ) : (
          <CustomerDashboard
            dishes={activeDishes}
            cart={cart}
            orders={myOrders}
            isSubmittingOrder={isSubmittingOrder}
            onAddToCart={addToCart}
            onUpdateCart={updateCart}
            onSubmitOrders={submitOrders}
          />
        )}
      </section>
    </main>
  );
}

function TopBar({
  title,
  subtitle,
  notice,
  mode,
  action,
  isRefreshing,
  onRefresh
}: {
  title: string;
  subtitle: string;
  notice: string;
  mode: "supabase" | "local";
  action?: ReactNode;
  isRefreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <header className="glass-panel flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/80 text-cyan-600 shadow-glow">
          <Sparkles size={24} />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-600">{subtitle}</p>
          <h1 className="text-2xl font-black text-slate-950 sm:text-3xl">{title}</h1>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill mode={mode} text={notice} inline />
        <button className="ghost-icon-button" onClick={onRefresh} aria-label="刷新">
          <RefreshCw className={isRefreshing ? "animate-spin" : ""} size={17} />
        </button>
        {action}
      </div>
    </header>
  );
}

function ChefDashboard({
  dishes,
  orders,
  dishName,
  dishPreview,
  isSavingDish,
  onDishNameChange,
  onFileChange,
  onSaveDish,
  onToggleDish,
  onUpdateOrderStatus
}: {
  dishes: Dish[];
  orders: Order[];
  dishName: string;
  dishPreview: string;
  isSavingDish: boolean;
  onDishNameChange: (value: string) => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSaveDish: (event: FormEvent<HTMLFormElement>) => void;
  onToggleDish: (dish: Dish) => void;
  onUpdateOrderStatus: (order: Order, status: OrderStatus) => void;
}) {
  const pendingCount = orders.filter((order) => order.status !== "完成").length;

  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="space-y-5">
        <form onSubmit={onSaveDish} className="glass-panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="section-kicker">Chef upload</p>
              <h2 className="section-title">上架新菜</h2>
            </div>
            <Store className="text-pink-500" size={25} />
          </div>
          <div className="space-y-4">
            <div>
              <label className="field-label" htmlFor="dish-name">
                菜品名称
              </label>
              <input
                id="dish-name"
                className="text-input"
                value={dishName}
                onChange={(event) => onDishNameChange(event.target.value)}
                placeholder="比如：银河蛋包饭"
              />
            </div>
            <label className="upload-box">
              {dishPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={dishPreview} alt="菜品预览" className="h-full w-full rounded-[22px] object-cover" />
              ) : (
                <span className="flex flex-col items-center gap-2 text-slate-500">
                  <Camera size={28} />
                  上传菜品图片
                </span>
              )}
              <input className="sr-only" type="file" accept="image/*" onChange={onFileChange} />
            </label>
            <button className="primary-button w-full" disabled={isSavingDish} type="submit">
              {isSavingDish ? <Loader2 className="animate-spin" size={18} /> : <Cloud size={18} />}
              保存到菜单宇宙
            </button>
          </div>
        </form>

        <section className="glass-panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="section-kicker">Permanent menu</p>
              <h2 className="section-title">已上架菜品</h2>
            </div>
            <span className="mini-badge">{dishes.length} 道</span>
          </div>
          <div className="grid gap-3">
            {dishes.length === 0 ? (
              <EmptyState text="还没有菜，先上传第一道招牌菜。" />
            ) : (
              dishes.map((dish) => (
                <DishRow key={dish.id} dish={dish} onToggle={() => onToggleDish(dish)} />
              ))
            )}
          </div>
        </section>
      </section>

      <section className="glass-panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="section-kicker">Orders incoming</p>
            <h2 className="section-title">收到的菜单</h2>
          </div>
          <div className={pendingCount > 0 ? "alarm-badge" : "mini-badge"}>
            <Bell size={15} />
            {pendingCount} 待处理
          </div>
        </div>
        <div className="grid gap-3">
          {orders.length === 0 ? (
            <EmptyState text="顾客还没有发来菜单。" />
          ) : (
            orders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                showCustomer
                onUpdateStatus={(status) => onUpdateOrderStatus(order, status)}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function CustomerDashboard({
  dishes,
  cart,
  orders,
  isSubmittingOrder,
  onAddToCart,
  onUpdateCart,
  onSubmitOrders
}: {
  dishes: Dish[];
  cart: CartItem[];
  orders: Order[];
  isSubmittingOrder: boolean;
  onAddToCart: (dish: Dish) => void;
  onUpdateCart: (dishId: string, patch: Partial<CartItem>) => void;
  onSubmitOrders: () => void;
}) {
  return (
    <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
      <section className="glass-panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="section-kicker">Cute tech menu</p>
            <h2 className="section-title">今日可点</h2>
          </div>
          <span className="mini-badge">{dishes.length} 道亮灯</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {dishes.length === 0 ? (
            <EmptyState text="厨师还没有上架菜品。" />
          ) : (
            dishes.map((dish) => <DishCard key={dish.id} dish={dish} onAdd={() => onAddToCart(dish)} />)
          )}
        </div>
      </section>

      <aside className="space-y-5">
        <section className="glass-panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="section-kicker">Cart uplink</p>
              <h2 className="section-title">我的菜单</h2>
            </div>
            <Heart className="text-pink-500" size={23} />
          </div>
          <div className="space-y-3">
            {cart.length === 0 ? (
              <EmptyState text="把喜欢的菜加入菜单吧。" />
            ) : (
              cart.map((item) => (
                <CartRow key={item.dish.id} item={item} onUpdate={(patch) => onUpdateCart(item.dish.id, patch)} />
              ))
            )}
          </div>
          <button className="primary-button mt-4 w-full" disabled={cart.length === 0 || isSubmittingOrder} onClick={onSubmitOrders}>
            {isSubmittingOrder ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
            发送给厨师
          </button>
        </section>

        <section className="glass-panel p-5">
          <div className="mb-4">
            <p className="section-kicker">Order status</p>
            <h2 className="section-title">我的订单状态</h2>
          </div>
          <div className="grid gap-3">
            {orders.length === 0 ? (
              <EmptyState text="还没有提交过订单。" />
            ) : (
              orders.map((order) => <OrderCard key={order.id} order={order} />)
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}

function DishCard({ dish, onAdd }: { dish: Dish; onAdd: () => void }) {
  return (
    <article className="dish-card">
      <div className="relative aspect-[4/3] overflow-hidden rounded-[24px] bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dish.image_url} alt={dish.name} className="h-full w-full object-cover" />
        <div className="absolute left-3 top-3 rounded-full bg-white/85 px-3 py-1 text-xs font-bold text-cyan-700 backdrop-blur">
          {dish.created_by}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <h3 className="min-w-0 text-lg font-black text-slate-950">{dish.name}</h3>
        <button className="round-button" onClick={onAdd} aria-label={`加入 ${dish.name}`}>
          <Plus size={19} />
        </button>
      </div>
    </article>
  );
}

function DishRow({ dish, onToggle }: { dish: Dish; onToggle: () => void }) {
  return (
    <article className="flex items-center gap-3 rounded-[22px] border border-white/70 bg-white/55 p-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={dish.image_url} alt={dish.name} className="h-16 w-16 rounded-2xl object-cover" />
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-black text-slate-950">{dish.name}</h3>
        <p className="text-xs text-slate-500">上架人：{dish.created_by}</p>
      </div>
      <button className={dish.is_active ? "toggle-on" : "toggle-off"} onClick={onToggle}>
        {dish.is_active ? "亮灯" : "下架"}
      </button>
    </article>
  );
}

function CartRow({ item, onUpdate }: { item: CartItem; onUpdate: (patch: Partial<CartItem>) => void }) {
  return (
    <article className="rounded-[22px] border border-white/70 bg-white/55 p-3">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.dish.image_url} alt={item.dish.name} className="h-14 w-14 rounded-2xl object-cover" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-black text-slate-950">{item.dish.name}</h3>
          <div className="mt-2 flex items-center gap-2">
            <button className="quantity-button" onClick={() => onUpdate({ quantity: item.quantity - 1 })}>
              <Minus size={15} />
            </button>
            <span className="w-8 text-center font-black">{item.quantity}</span>
            <button className="quantity-button" onClick={() => onUpdate({ quantity: item.quantity + 1 })}>
              <Plus size={15} />
            </button>
          </div>
        </div>
      </div>
      <input
        className="note-input mt-3"
        value={item.note}
        onChange={(event) => onUpdate({ note: event.target.value })}
        placeholder="备注：少糖/多辣/要爱心摆盘"
      />
    </article>
  );
}

function OrderCard({
  order,
  showCustomer,
  onUpdateStatus
}: {
  order: Order;
  showCustomer?: boolean;
  onUpdateStatus?: (status: OrderStatus) => void;
}) {
  return (
    <article className="rounded-[24px] border border-white/75 bg-white/60 p-3 shadow-[0_12px_35px_rgba(66,91,130,0.10)]">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={order.dish_image_url} alt={order.dish_name} className="h-16 w-16 rounded-2xl object-cover" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate font-black text-slate-950">{order.dish_name}</h3>
            <span className="status-chip">{order.status}</span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            x {order.quantity}
            {showCustomer ? ` / ${order.customer_name}` : ""}
          </p>
          {order.note ? <p className="mt-1 text-sm text-pink-600">备注：{order.note}</p> : null}
        </div>
      </div>
      {onUpdateStatus ? (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {ORDER_STATUSES.map((status) => (
            <button
              key={status}
              className={order.status === status ? "status-button-active" : "status-button"}
              onClick={() => onUpdateStatus(status)}
            >
              {status === "完成" ? <CheckCircle2 size={15} /> : null}
              {status}
            </button>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function Mascot({ label, compact = false }: { label: string; compact?: boolean }) {
  return (
    <div className={compact ? "mascot mascot-compact" : "mascot"}>
      <span className="mascot-ear left" />
      <span className="mascot-ear right" />
      <span className="mascot-eye left" />
      <span className="mascot-eye right" />
      <span className="mascot-mouth" />
      <span className="mascot-label">{label}</span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-[22px] border border-dashed border-cyan-200 bg-white/35 p-5 text-center text-sm font-semibold text-slate-500">
      {text}
    </div>
  );
}

function StatusPill({
  mode,
  text,
  inline = false
}: {
  mode: "supabase" | "local";
  text: string;
  inline?: boolean;
}) {
  return (
    <div className={inline ? "status-pill-inline" : "status-pill"}>
      <span className={mode === "supabase" ? "live-dot" : "local-dot"} />
      <span>{mode === "supabase" ? "云端" : "本地演示"}</span>
      <span className="hidden text-slate-300 sm:inline">/</span>
      <span className="truncate">{text}</span>
    </div>
  );
}

function AmbientDecor() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(120deg,#fff7fb_0%,#f4fbff_42%,#fffdf2_100%)]" />
      <div className="absolute inset-0 opacity-[0.35] [background-image:linear-gradient(rgba(56,189,248,.24)_1px,transparent_1px),linear-gradient(90deg,rgba(236,72,153,.18)_1px,transparent_1px)] [background-size:28px_28px]" />
      <div className="scanner-line" />
    </div>
  );
}
