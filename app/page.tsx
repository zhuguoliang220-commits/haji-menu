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
  Star,
  Store,
  Trash2,
  XCircle
} from "lucide-react";
import {
  Dish,
  DishCategory,
  MealPeriod,
  NewOrder,
  Order,
  OrderStatus,
  PEOPLE,
  PersonName,
  SessionChoice
} from "@/lib/types";

type BackendMode = "supabase" | "local";
type CartItem = {
  dish: Dish;
  quantity: number;
  note: string;
};

const sessionKey = "haji-menu-session";
const accessKey = "haji-menu-access";
const localDishesKey = "haji-menu-local-dishes";
const localOrdersKey = "haji-menu-local-orders";
const localCategoriesKey = "haji-menu-local-categories";
const configuredAccessCode = process.env.NEXT_PUBLIC_APP_ACCESS_CODE || "haji-love";

const avatarByPerson: Record<PersonName, string> = {
  哈基工: "/avatars/hajigong.jpg",
  哈吉梁: "/avatars/hajiliang.jpg"
};

function nowIso() {
  return new Date().toISOString();
}

function localId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMealPeriod(date = new Date()): MealPeriod {
  const hour = date.getHours();
  if (hour >= 5 && hour <= 10) return "早餐";
  if (hour >= 11 && hour <= 15) return "午饭";
  if (hour >= 16 && hour <= 21) return "晚饭";
  return "夜宵";
}

function getMealContext() {
  const now = new Date();
  return {
    date: formatDate(now),
    period: getMealPeriod(now)
  };
}

function formatTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
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

function normalizeCategories(categories: DishCategory[], dishes: Dish[]) {
  const next = [...categories];
  for (const person of PEOPLE) {
    const hasDefault = next.some((category) => category.created_by === person && category.name === "未分类");
    const hasLegacyDish = dishes.some((dish) => dish.created_by === person && !dish.category_id);
    if (!hasDefault || hasLegacyDish) {
      next.push({
        id: `local-default-${person}`,
        name: "未分类",
        created_by: person,
        created_at: nowIso()
      });
    }
  }
  return dedupeCategories(next);
}

function dedupeCategories(categories: DishCategory[]) {
  const seen = new Set<string>();
  return categories.filter((category) => {
    const key = `${category.created_by}-${category.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeDish(dish: Partial<Dish> & { id: string; name: string; image_url: string; created_by: PersonName; created_at: string }): Dish {
  return {
    id: dish.id,
    name: dish.name,
    image_url: dish.image_url,
    created_by: dish.created_by,
    category_id: dish.category_id ?? null,
    category_name: dish.category_name ?? null,
    is_active: dish.is_active ?? true,
    created_at: dish.created_at,
    deleted_at: dish.deleted_at ?? null
  };
}

function normalizeOrder(order: Partial<Order> & { id: string; customer_name: PersonName; dish_id: string; dish_name: string; dish_image_url: string; quantity: number; created_at: string; updated_at?: string }): Order {
  const created = new Date(order.created_at);
  const validCreated = Number.isNaN(created.getTime()) ? new Date() : created;
  const legacyStatus = order.status as string | undefined;
  const status: OrderStatus =
    legacyStatus === "已完成" || legacyStatus === "完成"
      ? "已完成"
      : legacyStatus === "已拒绝"
        ? "已拒绝"
        : "未完成";

  return {
    id: order.id,
    customer_name: order.customer_name,
    dish_id: order.dish_id,
    dish_name: order.dish_name,
    dish_image_url: order.dish_image_url,
    quantity: Math.max(1, Number(order.quantity) || 1),
    note: order.note ?? null,
    status,
    meal_date: order.meal_date ?? formatDate(validCreated),
    meal_period: order.meal_period ?? getMealPeriod(validCreated),
    completed_at: order.completed_at ?? null,
    rejected_at: order.rejected_at ?? null,
    rating: order.rating ?? null,
    rated_at: order.rated_at ?? null,
    created_at: order.created_at,
    updated_at: order.updated_at ?? order.created_at
  };
}

async function apiFetch<T>(path: string, accessCode: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("x-app-code", accessCode);
  if (!(init?.body instanceof FormData)) headers.set("content-type", "application/json");

  const response = await fetch(path, { ...init, headers });
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
  const [categories, setCategories] = useState<DishCategory[]>([]);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [dishName, setDishName] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [dishFile, setDishFile] = useState<File | null>(null);
  const [dishPreview, setDishPreview] = useState("");
  const [isSavingDish, setIsSavingDish] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [notice, setNotice] = useState("欢迎进入点菜舱");
  const [backendMode, setBackendMode] = useState<BackendMode>("supabase");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [mealContext, setMealContext] = useState(getMealContext);
  const [customerCategory, setCustomerCategory] = useState("all");

  const isChef = session?.role === "chef";

  const visibleDishes = useMemo(() => dishes.filter((dish) => !dish.deleted_at), [dishes]);
  const activeDishes = useMemo(() => visibleDishes.filter((dish) => dish.is_active), [visibleDishes]);
  const inactiveDishes = useMemo(() => visibleDishes.filter((dish) => !dish.is_active), [visibleDishes]);
  const currentOrders = useMemo(
    () => orders.filter((order) => order.meal_date === mealContext.date && order.meal_period === mealContext.period),
    [mealContext.date, mealContext.period, orders]
  );
  const unfinishedOrders = useMemo(() => currentOrders.filter((order) => order.status === "未完成"), [currentOrders]);
  const finishedOrders = useMemo(
    () => orders.filter((order) => order.status === "已完成" || order.status === "已拒绝"),
    [orders]
  );
  const myCurrentOrders = useMemo(
    () => currentOrders.filter((order) => order.customer_name === session?.person),
    [currentOrders, session?.person]
  );
  const myFinishedOrders = useMemo(
    () => finishedOrders.filter((order) => order.customer_name === session?.person),
    [finishedOrders, session?.person]
  );
  const myCategories = useMemo(
    () => categories.filter((category) => category.created_by === session?.person),
    [categories, session?.person]
  );

  const loadData = useCallback(
    async (code = accessCode) => {
      if (!code) return;
      setIsRefreshing(true);
      try {
        const [categoryResult, dishResult, orderResult] = await Promise.all([
          apiFetch<{ categories: DishCategory[] }>("/api/categories", code),
          apiFetch<{ dishes: Dish[] }>("/api/dishes", code),
          apiFetch<{ orders: Order[] }>("/api/orders", code)
        ]);
        const nextDishes = dishResult.dishes.map(normalizeDish);
        setDishes(nextDishes);
        setCategories(normalizeCategories(categoryResult.categories, nextDishes));
        setOrders(orderResult.orders.map(normalizeOrder));
        setBackendMode("supabase");
      } catch {
        const localDishes = readLocal<Dish[]>(localDishesKey, []).map(normalizeDish);
        const localCategories = normalizeCategories(readLocal<DishCategory[]>(localCategoriesKey, []), localDishes);
        setBackendMode("local");
        setDishes(localDishes);
        setCategories(localCategories);
        setOrders(readLocal<Order[]>(localOrdersKey, []).map(normalizeOrder));
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
    const timer = window.setInterval(() => setMealContext(getMealContext()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!accessGranted || !accessCode) return;
    const interval = window.setInterval(() => void loadData(accessCode), 5000);
    const syncLocal = () => {
      if (backendMode === "local") {
        const localDishes = readLocal<Dish[]>(localDishesKey, []).map(normalizeDish);
        setDishes(localDishes);
        setCategories(normalizeCategories(readLocal<DishCategory[]>(localCategoriesKey, []), localDishes));
        setOrders(readLocal<Order[]>(localOrdersKey, []).map(normalizeOrder));
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
    const result = await apiFetch<{ url: string }>("/api/upload", accessCode, { method: "POST", body: formData });
    return result.url;
  }

  function ensureLocalCategory(name: string, owner: PersonName) {
    const trimmed = name.trim() || "未分类";
    const existing = categories.find((category) => category.created_by === owner && category.name === trimmed);
    if (existing) return existing;
    const nextCategory: DishCategory = {
      id: localId("category"),
      name: trimmed,
      created_by: owner,
      created_at: nowIso()
    };
    const nextCategories = dedupeCategories([nextCategory, ...categories]);
    setCategories(nextCategories);
    writeLocal(localCategoriesKey, nextCategories);
    return nextCategory;
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
      const pickedCategory = myCategories.find((category) => category.id === selectedCategoryId);
      const nextCategoryName = categoryName.trim() || pickedCategory?.name || "未分类";

      if (backendMode === "local") {
        const category = ensureLocalCategory(nextCategoryName, session.person);
        const nextDish: Dish = {
          id: localId("dish"),
          name: dishName.trim(),
          image_url: imageUrl,
          created_by: session.person,
          category_id: category.id,
          category_name: category.name,
          is_active: true,
          created_at: nowIso(),
          deleted_at: null
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
            created_by: session.person,
            category_id: selectedCategoryId || null,
            category_name: categoryName.trim() || undefined
          })
        });
        await loadData();
      }

      setDishName("");
      setCategoryName("");
      setSelectedCategoryId("");
      setDishFile(null);
      setNotice("新菜已上架到对应菜系");
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

  async function deleteDish(dish: Dish) {
    if (dish.is_active) {
      setNotice("请先下架，再删除菜品");
      return;
    }
    if (backendMode === "local") {
      const nextDishes = dishes.map((item) => (item.id === dish.id ? { ...item, deleted_at: nowIso() } : item));
      setDishes(nextDishes);
      writeLocal(localDishesKey, nextDishes);
      return;
    }
    await apiFetch<{ dish: Dish }>(`/api/dishes/${dish.id}`, accessCode, {
      method: "PATCH",
      body: JSON.stringify({ deleted: true })
    });
    await loadData();
  }

  function addToCart(dish: Dish) {
    setCart((items) => {
      const existing = items.find((item) => item.dish.id === dish.id);
      if (existing) {
        return items.map((item) => (item.dish.id === dish.id ? { ...item, quantity: item.quantity + 1 } : item));
      }
      return [...items, { dish, quantity: 1, note: "" }];
    });
    setNotice(`${dish.name} 已加入${mealContext.period}菜单`);
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
        note: item.note,
        meal_date: mealContext.date,
        meal_period: mealContext.period
      }));

      if (backendMode === "local") {
        const createdAt = nowIso();
        const created: Order[] = newOrders.map((order) => ({
          id: localId("order"),
          ...order,
          note: order.note?.trim() || null,
          status: "未完成",
          completed_at: null,
          rejected_at: null,
          rating: null,
          rated_at: null,
          created_at: createdAt,
          updated_at: createdAt
        }));
        const nextOrders = [...created, ...orders];
        setOrders(nextOrders);
        writeLocal(localOrdersKey, nextOrders);
      } else {
        await Promise.all(
          newOrders.map((order) =>
            apiFetch<{ order: Order }>("/api/orders", accessCode, { method: "POST", body: JSON.stringify(order) })
          )
        );
        await loadData();
      }
      setCart([]);
      setNotice(`${mealContext.period}菜单已发送给厨师`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "提交失败");
    } finally {
      setIsSubmittingOrder(false);
    }
  }

  async function updateOrderStatus(order: Order, status: OrderStatus) {
    const timestamp = nowIso();
    if (backendMode === "local") {
      const nextOrders = orders.map((item) =>
        item.id === order.id
          ? {
              ...item,
              status,
              completed_at: status === "已完成" ? timestamp : item.completed_at,
              rejected_at: status === "已拒绝" ? timestamp : item.rejected_at,
              updated_at: timestamp
            }
          : item
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

  async function rateOrder(order: Order, rating: number) {
    if (order.status !== "已完成") return;
    const timestamp = nowIso();
    if (backendMode === "local") {
      const nextOrders = orders.map((item) =>
        item.id === order.id ? { ...item, rating, rated_at: timestamp, updated_at: timestamp } : item
      );
      setOrders(nextOrders);
      writeLocal(localOrdersKey, nextOrders);
      return;
    }
    await apiFetch<{ order: Order }>(`/api/orders/${order.id}`, accessCode, {
      method: "PATCH",
      body: JSON.stringify({ rating })
    });
    await loadData();
  }

  async function clearFinishedHistory(scope: "all" | "mine") {
    if (!session) return;
    if (backendMode === "local") {
      const nextOrders = orders.filter((order) => {
        const isFinished = order.status === "已完成" || order.status === "已拒绝";
        if (!isFinished) return true;
        return scope === "mine" ? order.customer_name !== session.person : false;
      });
      setOrders(nextOrders);
      writeLocal(localOrdersKey, nextOrders);
      setNotice("已完成历史已永久清除");
      return;
    }
    const query = scope === "mine" ? `?customer=${encodeURIComponent(session.person)}` : "";
    await apiFetch<{ ok: boolean }>(`/api/orders${query}`, accessCode, { method: "DELETE" });
    await loadData();
    setNotice("已完成历史已永久清除");
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    setDishFile(event.target.files?.[0] ?? null);
  }

  if (!accessGranted) {
    return (
      <main className="min-h-screen overflow-hidden px-5 py-8 text-slate-900">
        <AmbientDecor />
        <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col justify-center">
          <div className="mb-7 flex items-center justify-center gap-3">
            {PEOPLE.map((person) => (
              <Avatar key={person} person={person} size="lg" />
            ))}
          </div>
          <div className="glass-panel p-6 shadow-soft">
            <div className="mb-6 text-center">
              <p className="section-kicker">Private kitchen link</p>
              <h1 className="mt-3 text-3xl font-black text-slate-950">点菜舱启动</h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">输入你们的共享访问码，进入哈基工和哈吉梁的小小菜单宇宙。</p>
            </div>
            <form onSubmit={unlock} className="space-y-4">
              <label className="field-label" htmlFor="access-code">访问码</label>
              <input
                id="access-code"
                className="text-input"
                value={accessCode}
                onChange={(event) => setAccessCode(event.target.value)}
                placeholder="输入情侣访问码"
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
            mealContext={mealContext}
            onRefresh={() => loadData()}
            isRefreshing={isRefreshing}
          />
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {PEOPLE.map((person) => (
              <div key={person} className="glass-panel p-5">
                <div className="flex items-center gap-4">
                  <Avatar person={person} size="md" />
                  <div>
                    <p className="section-kicker">Profile</p>
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
          mealContext={mealContext}
          person={session.person}
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
            categories={categories}
            myCategories={myCategories}
            activeDishes={activeDishes}
            inactiveDishes={inactiveDishes}
            unfinishedOrders={unfinishedOrders}
            finishedOrders={finishedOrders}
            dishName={dishName}
            categoryName={categoryName}
            selectedCategoryId={selectedCategoryId}
            dishPreview={dishPreview}
            isSavingDish={isSavingDish}
            mealContext={mealContext}
            onDishNameChange={setDishName}
            onCategoryNameChange={setCategoryName}
            onSelectedCategoryChange={setSelectedCategoryId}
            onFileChange={onFileChange}
            onSaveDish={saveDish}
            onToggleDish={toggleDish}
            onDeleteDish={deleteDish}
            onUpdateOrderStatus={updateOrderStatus}
            onClearHistory={() => clearFinishedHistory("all")}
          />
        ) : (
          <CustomerDashboard
            categories={categories}
            dishes={activeDishes}
            customerCategory={customerCategory}
            cart={cart}
            currentOrders={myCurrentOrders}
            finishedOrders={myFinishedOrders}
            isSubmittingOrder={isSubmittingOrder}
            mealContext={mealContext}
            onCategoryChange={setCustomerCategory}
            onAddToCart={addToCart}
            onUpdateCart={updateCart}
            onSubmitOrders={submitOrders}
            onRateOrder={rateOrder}
            onClearHistory={() => clearFinishedHistory("mine")}
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
  mealContext,
  person,
  onRefresh
}: {
  title: string;
  subtitle: string;
  notice: string;
  mode: BackendMode;
  action?: ReactNode;
  isRefreshing: boolean;
  mealContext: { date: string; period: MealPeriod };
  person?: PersonName;
  onRefresh: () => void;
}) {
  return (
    <header className="glass-panel flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        {person ? (
          <Avatar person={person} size="sm" />
        ) : (
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/80 text-cyan-600 shadow-glow">
            <Sparkles size={24} />
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-xs font-bold uppercase tracking-[0.18em] text-cyan-600">{subtitle}</p>
          <h1 className="truncate text-2xl font-black text-slate-950 sm:text-3xl">{title}</h1>
          <p className="mt-1 text-xs font-bold text-pink-500">
            {mealContext.date} / 当前{mealContext.period}
          </p>
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
  categories,
  myCategories,
  activeDishes,
  inactiveDishes,
  unfinishedOrders,
  finishedOrders,
  dishName,
  categoryName,
  selectedCategoryId,
  dishPreview,
  isSavingDish,
  mealContext,
  onDishNameChange,
  onCategoryNameChange,
  onSelectedCategoryChange,
  onFileChange,
  onSaveDish,
  onToggleDish,
  onDeleteDish,
  onUpdateOrderStatus,
  onClearHistory
}: {
  categories: DishCategory[];
  myCategories: DishCategory[];
  activeDishes: Dish[];
  inactiveDishes: Dish[];
  unfinishedOrders: Order[];
  finishedOrders: Order[];
  dishName: string;
  categoryName: string;
  selectedCategoryId: string;
  dishPreview: string;
  isSavingDish: boolean;
  mealContext: { date: string; period: MealPeriod };
  onDishNameChange: (value: string) => void;
  onCategoryNameChange: (value: string) => void;
  onSelectedCategoryChange: (value: string) => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSaveDish: (event: FormEvent<HTMLFormElement>) => void;
  onToggleDish: (dish: Dish) => void;
  onDeleteDish: (dish: Dish) => void;
  onUpdateOrderStatus: (order: Order, status: OrderStatus) => void;
  onClearHistory: () => void;
}) {
  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
      <section className="space-y-5">
        <form onSubmit={onSaveDish} className="glass-panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="section-kicker">Chef upload</p>
              <h2 className="section-title">上架新菜</h2>
            </div>
            <Store className="text-pink-500" size={25} />
          </div>
          <div className="grid gap-4">
            <div>
              <label className="field-label" htmlFor="dish-name">菜品名称</label>
              <input
                id="dish-name"
                className="text-input"
                value={dishName}
                onChange={(event) => onDishNameChange(event.target.value)}
                placeholder="比如：清炒时蔬"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="field-label" htmlFor="dish-category">选择菜系</label>
                <select
                  id="dish-category"
                  className="select-input"
                  value={selectedCategoryId}
                  onChange={(event) => onSelectedCategoryChange(event.target.value)}
                >
                  <option value="">新建/未分类</option>
                  {myCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="new-category">新菜系</label>
                <input
                  id="new-category"
                  className="text-input"
                  value={categoryName}
                  onChange={(event) => onCategoryNameChange(event.target.value)}
                  placeholder="比如：素菜"
                />
              </div>
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

        <DishShelf
          title="已上架菜品"
          countText={`${activeDishes.length} 道亮灯`}
          dishes={activeDishes}
          categories={categories}
          onToggleDish={onToggleDish}
        />
        <DishShelf
          title="已下架菜品"
          countText={`${inactiveDishes.length} 道下架`}
          dishes={inactiveDishes}
          categories={categories}
          onToggleDish={onToggleDish}
          onDeleteDish={onDeleteDish}
          emptyText="下架菜品会在这里沉睡，之后可以重新上架或删除。"
        />
      </section>

      <section className="space-y-5">
        <section className="glass-panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="section-kicker">Orders incoming</p>
              <h2 className="section-title">{mealContext.period}未完成订单</h2>
            </div>
            <div className={unfinishedOrders.length > 0 ? "alarm-badge" : "mini-badge"}>
              <Bell size={15} />
              {unfinishedOrders.length} 待处理
            </div>
          </div>
          <div className="grid gap-3">
            {unfinishedOrders.length === 0 ? (
              <EmptyState text={`当前${mealContext.period}还没有待处理订单。`} />
            ) : (
              unfinishedOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  showCustomer
                  chefMode
                  onUpdateStatus={(status) => onUpdateOrderStatus(order, status)}
                />
              ))
            )}
          </div>
        </section>

        <section className="glass-panel p-5">
          <HistoryHeader title="已完成订单" count={finishedOrders.length} onClearHistory={onClearHistory} />
          <div className="grid gap-3">
            {finishedOrders.length === 0 ? (
              <EmptyState text="完成或拒绝的订单会进入这里。" />
            ) : (
              finishedOrders.map((order) => <OrderCard key={order.id} order={order} showCustomer />)
            )}
          </div>
          <p className="mt-3 text-xs font-semibold text-slate-500">
            厨师清除历史会永久删除全部已完成和已拒绝订单。
          </p>
        </section>
      </section>
    </div>
  );
}

function CustomerDashboard({
  categories,
  dishes,
  customerCategory,
  cart,
  currentOrders,
  finishedOrders,
  isSubmittingOrder,
  mealContext,
  onCategoryChange,
  onAddToCart,
  onUpdateCart,
  onSubmitOrders,
  onRateOrder,
  onClearHistory
}: {
  categories: DishCategory[];
  dishes: Dish[];
  customerCategory: string;
  cart: CartItem[];
  currentOrders: Order[];
  finishedOrders: Order[];
  isSubmittingOrder: boolean;
  mealContext: { date: string; period: MealPeriod };
  onCategoryChange: (value: string) => void;
  onAddToCart: (dish: Dish) => void;
  onUpdateCart: (dishId: string, patch: Partial<CartItem>) => void;
  onSubmitOrders: () => void;
  onRateOrder: (order: Order, rating: number) => void;
  onClearHistory: () => void;
}) {
  const categoryOptions = useMemo(() => {
    const used = new Set(dishes.map((dish) => dish.category_id || `name-${dish.category_name || "未分类"}`));
    return categories.filter((category) => used.has(category.id));
  }, [categories, dishes]);
  const filteredDishes = useMemo(
    () => dishes.filter((dish) => customerCategory === "all" || dish.category_id === customerCategory),
    [customerCategory, dishes]
  );
  const unfinished = currentOrders.filter((order) => order.status === "未完成");
  const currentFinished = currentOrders.filter((order) => order.status !== "未完成");

  return (
    <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
      <section className="glass-panel p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="section-kicker">Cute tech menu</p>
            <h2 className="section-title">{mealContext.period}可点</h2>
          </div>
          <select className="select-input max-w-44" value={customerCategory} onChange={(event) => onCategoryChange(event.target.value)}>
            <option value="all">全部菜系</option>
            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <CategoryMenu dishes={filteredDishes} categories={categories} onAddToCart={onAddToCart} />
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
              <EmptyState text={`把喜欢的菜加入${mealContext.period}菜单吧。`} />
            ) : (
              cart.map((item) => <CartRow key={item.dish.id} item={item} onUpdate={(patch) => onUpdateCart(item.dish.id, patch)} />)
            )}
          </div>
          <button className="primary-button mt-4 w-full" disabled={cart.length === 0 || isSubmittingOrder} onClick={onSubmitOrders}>
            {isSubmittingOrder ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
            发送给厨师
          </button>
        </section>

        <section className="glass-panel p-5">
          <div className="mb-4">
            <p className="section-kicker">Current period</p>
            <h2 className="section-title">{mealContext.period}订单</h2>
          </div>
          <div className="grid gap-3">
            {[...unfinished, ...currentFinished].length === 0 ? (
              <EmptyState text={`当前${mealContext.period}还没有订单，午饭历史不会混进晚饭。`} />
            ) : (
              [...unfinished, ...currentFinished].map((order) => (
                <OrderCard key={order.id} order={order} onRateOrder={(rating) => onRateOrder(order, rating)} />
              ))
            )}
          </div>
        </section>

        <section className="glass-panel p-5">
          <HistoryHeader title="我的已完成历史" count={finishedOrders.length} onClearHistory={onClearHistory} />
          <div className="grid gap-3">
            {finishedOrders.length === 0 ? (
              <EmptyState text="完成后的历史会在这里，想清空时可以一键删除。" />
            ) : (
              finishedOrders.map((order) => (
                <OrderCard key={order.id} order={order} onRateOrder={(rating) => onRateOrder(order, rating)} />
              ))
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}

function DishShelf({
  title,
  countText,
  dishes,
  categories,
  emptyText = "还没有菜，先上传第一道招牌菜。",
  onToggleDish,
  onDeleteDish
}: {
  title: string;
  countText: string;
  dishes: Dish[];
  categories: DishCategory[];
  emptyText?: string;
  onToggleDish: (dish: Dish) => void;
  onDeleteDish?: (dish: Dish) => void;
}) {
  return (
    <section className="glass-panel p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="section-kicker">Permanent menu</p>
          <h2 className="section-title">{title}</h2>
        </div>
        <span className="mini-badge">{countText}</span>
      </div>
      <CategoryRows dishes={dishes} categories={categories} onToggleDish={onToggleDish} onDeleteDish={onDeleteDish} emptyText={emptyText} />
    </section>
  );
}

function CategoryRows({
  dishes,
  categories,
  emptyText,
  onToggleDish,
  onDeleteDish
}: {
  dishes: Dish[];
  categories: DishCategory[];
  emptyText: string;
  onToggleDish: (dish: Dish) => void;
  onDeleteDish?: (dish: Dish) => void;
}) {
  const grouped = groupDishes(dishes, categories);
  if (dishes.length === 0) return <EmptyState text={emptyText} />;
  return (
    <div className="space-y-4">
      {grouped.map((group) => (
        <div key={group.name}>
          <div className="mb-2 flex items-center gap-2">
            <span className="category-dot" />
            <h3 className="text-sm font-black text-slate-800">{group.name}</h3>
          </div>
          <div className="grid gap-3">
            {group.dishes.map((dish) => (
              <DishRow key={dish.id} dish={dish} onToggle={() => onToggleDish(dish)} onDelete={onDeleteDish ? () => onDeleteDish(dish) : undefined} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CategoryMenu({ dishes, categories, onAddToCart }: { dishes: Dish[]; categories: DishCategory[]; onAddToCart: (dish: Dish) => void }) {
  const grouped = groupDishes(dishes, categories);
  if (dishes.length === 0) return <EmptyState text="厨师还没有上架符合条件的菜品。" />;
  return (
    <div className="space-y-5">
      {grouped.map((group) => (
        <section key={group.name}>
          <div className="mb-3 flex items-center gap-2">
            <span className="category-dot" />
            <h3 className="text-base font-black text-slate-950">{group.name}</h3>
            <span className="mini-badge">{group.dishes.length} 道</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.dishes.map((dish) => <DishCard key={dish.id} dish={dish} onAdd={() => onAddToCart(dish)} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

function groupDishes(dishes: Dish[], categories: DishCategory[]) {
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const map = new Map<string, Dish[]>();
  for (const dish of dishes) {
    const name = dish.category_name || (dish.category_id ? categoryNames.get(dish.category_id) : null) || "未分类";
    map.set(name, [...(map.get(name) ?? []), dish]);
  }
  return Array.from(map.entries()).map(([name, groupedDishes]) => ({ name, dishes: groupedDishes }));
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
        <h3 className="min-w-0 break-words text-lg font-black text-slate-950">{dish.name}</h3>
        <button className="round-button" onClick={onAdd} aria-label={`加入 ${dish.name}`}>
          <Plus size={19} />
        </button>
      </div>
    </article>
  );
}

function DishRow({ dish, onToggle, onDelete }: { dish: Dish; onToggle: () => void; onDelete?: () => void }) {
  return (
    <article className="flex items-center gap-3 rounded-[22px] border border-white/70 bg-white/55 p-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={dish.image_url} alt={dish.name} className="h-16 w-16 rounded-2xl object-cover" />
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-black text-slate-950">{dish.name}</h3>
        <p className="text-xs text-slate-500">上架人：{dish.created_by}</p>
      </div>
      <button className={dish.is_active ? "toggle-on" : "toggle-off"} onClick={onToggle}>
        {dish.is_active ? "下架" : "上架"}
      </button>
      {onDelete ? (
        <button className="danger-icon-button" onClick={onDelete} aria-label={`删除 ${dish.name}`}>
          <Trash2 size={16} />
        </button>
      ) : null}
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
            <button className="quantity-button" onClick={() => onUpdate({ quantity: item.quantity - 1 })} aria-label="减少数量">
              <Minus size={15} />
            </button>
            <span className="w-8 text-center font-black">{item.quantity}</span>
            <button className="quantity-button" onClick={() => onUpdate({ quantity: item.quantity + 1 })} aria-label="增加数量">
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
  chefMode,
  onUpdateStatus,
  onRateOrder
}: {
  order: Order;
  showCustomer?: boolean;
  chefMode?: boolean;
  onUpdateStatus?: (status: OrderStatus) => void;
  onRateOrder?: (rating: number) => void;
}) {
  const isRejected = order.status === "已拒绝";
  const canRate = order.status === "已完成" && !isRejected && Boolean(onRateOrder);
  return (
    <article className="rounded-[24px] border border-white/75 bg-white/60 p-3 shadow-[0_12px_35px_rgba(66,91,130,0.10)]">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={order.dish_image_url} alt={order.dish_name} className="h-16 w-16 rounded-2xl object-cover" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate font-black text-slate-950">{order.dish_name}</h3>
            <span className={isRejected ? "reject-chip" : "status-chip"}>{order.status}</span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            x {order.quantity}
            {showCustomer ? ` / ${order.customer_name}` : ""}
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            点单：{formatTime(order.created_at)} / {order.meal_period}
          </p>
          {order.note ? <p className="mt-1 text-sm text-pink-600">备注：{order.note}</p> : null}
          {order.rating ? <StarRating value={order.rating} readonly /> : null}
        </div>
      </div>
      {chefMode && onUpdateStatus ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button className="status-button-active" onClick={() => onUpdateStatus("已完成")}>
            <CheckCircle2 size={15} />
            完成
          </button>
          <button className="reject-button" onClick={() => onUpdateStatus("已拒绝")}>
            <XCircle size={15} />
            拒绝
          </button>
        </div>
      ) : null}
      {canRate ? <StarRating value={order.rating ?? 0} onRate={onRateOrder} /> : null}
    </article>
  );
}

function StarRating({ value, readonly = false, onRate }: { value: number; readonly?: boolean; onRate?: (rating: number) => void }) {
  return (
    <div className="mt-3 flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          className={star <= value ? "star-button-on" : "star-button"}
          onClick={() => onRate?.(star)}
          disabled={readonly}
          aria-label={`${star} 星`}
        >
          <Star size={16} fill="currentColor" />
        </button>
      ))}
    </div>
  );
}

function HistoryHeader({ title, count, onClearHistory }: { title: string; count: number; onClearHistory: () => void }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="section-kicker">History</p>
        <h2 className="section-title">{title}</h2>
      </div>
      <div className="flex items-center gap-2">
        <span className="mini-badge">{count} 条</span>
        <button className="danger-button" disabled={count === 0} onClick={onClearHistory}>
          <Trash2 size={15} />
          清除
        </button>
      </div>
    </div>
  );
}

function Avatar({ person, size }: { person: PersonName; size: "sm" | "md" | "lg" }) {
  const className =
    size === "lg" ? "avatar avatar-lg" : size === "md" ? "avatar avatar-md" : "avatar avatar-sm";
  return (
    <div className={className}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={avatarByPerson[person]} alt={person} />
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

function StatusPill({ mode, text, inline = false }: { mode: BackendMode; text: string; inline?: boolean }) {
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
