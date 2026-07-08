"use client";

import { ChangeEvent, FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  Camera,
  CheckCircle2,
  ChefHat,
  ClipboardList,
  Cloud,
  Edit3,
  Heart,
  Loader2,
  LogOut,
  ChevronDown,
  MessageCircle,
  Minus,
  NotebookPen,
  Plus,
  Power,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  Star,
  Store,
  Trash2,
  X,
  XCircle
} from "lucide-react";
import {
  ChatMessage,
  CustomDishRequest,
  Dish,
  DishAvailability,
  DishCategory,
  MEAL_PERIODS,
  MealPeriod,
  NewCustomDishRequest,
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

type MealChoice = {
  date: string;
  period: MealPeriod;
};

type EditDishState = {
  dish: Dish;
  name: string;
  categoryText: string;
  file: File | null;
  preview: string;
};

type CustomRequestForm = {
  dish_name: string;
  method: string;
  amount: string;
  note: string;
};

const sessionKey = "haji-menu-session";
const accessKey = "haji-menu-access";
const localDishesKey = "haji-menu-local-dishes";
const localOrdersKey = "haji-menu-local-orders";
const localCategoriesKey = "haji-menu-local-categories";
const localAvailabilityKey = "haji-menu-local-availability";
const localMessagesKey = "haji-menu-local-messages";
const localCustomRequestsKey = "haji-menu-local-custom-requests";
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

function otherPerson(person: PersonName): PersonName {
  return person === "哈基工" ? "哈吉梁" : "哈基工";
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

function getDefaultMealChoice(): MealChoice {
  return { date: formatDate(), period: getMealPeriod() };
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

function categoryLabel(category: DishCategory) {
  return category.path?.length ? category.path.join(" / ") : category.name;
}

function parseCategoryText(value: string) {
  return value
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) =>
      item
        .split("/")
        .map((part) => part.trim())
        .filter(Boolean)
        .slice(0, 3)
    )
    .filter((path) => path.length > 0);
}

function categoriesToText(categories: DishCategory[]) {
  return categories.map(categoryLabel).join("，");
}

function pathKey(path: string[]) {
  return path.join("||");
}

function keyToPath(key: string) {
  return key === "all" ? [] : key.split("||").filter(Boolean);
}

function categoryMatchesPath(category: DishCategory, key: string) {
  const picked = keyToPath(key);
  if (picked.length === 0) return true;
  return picked.every((part, index) => category.path[index] === part);
}

function dishMatchesPath(dish: Dish, key: string) {
  return key === "all" || dish.categories.some((category) => categoryMatchesPath(category, key));
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
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

function normalizeCategory(category: Partial<DishCategory> & { id: string; name: string; created_by: PersonName; created_at: string }): DishCategory {
  return {
    id: category.id,
    name: category.name,
    path: category.path?.length ? category.path : [category.name],
    created_by: category.created_by,
    created_at: category.created_at
  };
}

function normalizeDish(dish: Partial<Dish> & { id: string; name: string; image_url: string; created_by: PersonName; created_at: string }): Dish {
  const categories = (dish.categories ?? []).map(normalizeCategory);
  return {
    id: dish.id,
    name: dish.name,
    image_url: dish.image_url,
    created_by: dish.created_by,
    category_id: categories[0]?.id ?? dish.category_id ?? null,
    category_name: categories[0]?.name ?? dish.category_name ?? null,
    categories,
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
    chef_name: order.chef_name ?? null,
    completed_at: order.completed_at ?? null,
    rejected_at: order.rejected_at ?? null,
    rating: order.rating ?? null,
    review_text: order.review_text ?? null,
    rated_at: order.rated_at ?? null,
    created_at: order.created_at,
    updated_at: order.updated_at ?? order.created_at
  };
}

function normalizeAvailability(item: Partial<DishAvailability> & { id: string; chef_name: PersonName; dish_id: string; meal_date: string; meal_period: MealPeriod; created_at: string }): DishAvailability {
  return {
    id: item.id,
    chef_name: item.chef_name,
    dish_id: item.dish_id,
    meal_date: item.meal_date,
    meal_period: item.meal_period,
    created_at: item.created_at
  };
}

function normalizeMessage(item: Partial<ChatMessage> & { id: string; sender_name: PersonName; receiver_name: PersonName; body: string; created_at: string }): ChatMessage {
  return {
    id: item.id,
    sender_name: item.sender_name,
    receiver_name: item.receiver_name,
    body: item.body,
    created_at: item.created_at
  };
}

function normalizeCustomRequest(item: Partial<CustomDishRequest> & { id: string; customer_name: PersonName; chef_name: PersonName; meal_date: string; meal_period: MealPeriod; created_at: string }): CustomDishRequest {
  return {
    id: item.id,
    customer_name: item.customer_name,
    chef_name: item.chef_name,
    dish_name: item.dish_name ?? null,
    method: item.method ?? null,
    amount: item.amount ?? null,
    note: item.note ?? null,
    meal_date: item.meal_date,
    meal_period: item.meal_period,
    created_at: item.created_at
  };
}

function ensureLocalCategories(paths: string[][], owner: PersonName, categories: DishCategory[]) {
  const next = [...categories];
  const ids: string[] = [];
  const wanted = paths.length > 0 ? paths : [["未分类"]];

  for (const path of wanted) {
    const cleanPath = path.map((part) => part.trim()).filter(Boolean).slice(0, 3);
    if (cleanPath.length === 0) continue;
    const name = cleanPath.join(" / ");
    let category = next.find((item) => item.created_by === owner && item.name === name);
    if (!category) {
      category = {
        id: localId("category"),
        name,
        path: cleanPath,
        created_by: owner,
        created_at: nowIso()
      };
      next.unshift(category);
    }
    ids.push(category.id);
  }

  return { categories: dedupeCategories(next), ids };
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
  const [availability, setAvailability] = useState<DishAvailability[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [customRequests, setCustomRequests] = useState<CustomDishRequest[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [chatText, setChatText] = useState("");
  const [customRequestForm, setCustomRequestForm] = useState<CustomRequestForm>({
    dish_name: "",
    method: "",
    amount: "",
    note: ""
  });
  const [dishName, setDishName] = useState("");
  const [categoryText, setCategoryText] = useState("");
  const [dishFile, setDishFile] = useState<File | null>(null);
  const [dishPreview, setDishPreview] = useState("");
  const [editDish, setEditDish] = useState<EditDishState | null>(null);
  const [isSavingDish, setIsSavingDish] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [notice, setNotice] = useState("欢迎进入点菜舱");
  const [backendMode, setBackendMode] = useState<BackendMode>("supabase");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [mealChoice, setMealChoice] = useState<MealChoice>(getDefaultMealChoice);
  const [activePath, setActivePath] = useState("all");

  const isChef = session?.role === "chef";
  const selectedChef = session ? (isChef ? session.person : otherPerson(session.person)) : null;
  const chatPartner = session ? otherPerson(session.person) : null;

  const visibleDishes = useMemo(() => dishes.filter((dish) => !dish.deleted_at), [dishes]);
  const chefDishes = useMemo(
    () => visibleDishes.filter((dish) => dish.created_by === session?.person),
    [session?.person, visibleDishes]
  );
  const activeChefDishes = useMemo(() => chefDishes.filter((dish) => dish.is_active), [chefDishes]);
  const inactiveChefDishes = useMemo(() => chefDishes.filter((dish) => !dish.is_active), [chefDishes]);
  const selectedAvailability = useMemo(
    () =>
      availability.filter(
        (item) =>
          item.chef_name === selectedChef &&
          item.meal_date === mealChoice.date &&
          item.meal_period === mealChoice.period
      ),
    [availability, mealChoice.date, mealChoice.period, selectedChef]
  );
  const selectedSupplyIds = useMemo(
    () => new Set(selectedAvailability.map((item) => item.dish_id)),
    [selectedAvailability]
  );
  const customerMenuDishes = useMemo(
    () =>
      visibleDishes.filter(
        (dish) =>
          dish.created_by === selectedChef &&
          dish.is_active &&
          selectedSupplyIds.has(dish.id)
      ),
    [selectedChef, selectedSupplyIds, visibleDishes]
  );
  const filteredCustomerDishes = useMemo(
    () =>
      customerMenuDishes.filter(
        (dish) => dishMatchesPath(dish, activePath)
      ),
    [activePath, customerMenuDishes]
  );
  const customerTags = useMemo(() => collectTags(customerMenuDishes), [customerMenuDishes]);
  const chefTags = useMemo(() => collectTags(chefDishes), [chefDishes]);
  const currentOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          order.meal_date === mealChoice.date &&
          order.meal_period === mealChoice.period &&
          (isChef ? order.chef_name === session?.person : order.customer_name === session?.person)
      ),
    [isChef, mealChoice.date, mealChoice.period, orders, session?.person]
  );
  const unfinishedOrders = useMemo(() => currentOrders.filter((order) => order.status === "未完成"), [currentOrders]);
  const finishedOrders = useMemo(
    () =>
      orders.filter((order) => {
        const done = order.status === "已完成" || order.status === "已拒绝";
        if (!done) return false;
        return isChef ? order.chef_name === session?.person : order.customer_name === session?.person;
      }),
    [isChef, orders, session?.person]
  );
  const conversationMessages = useMemo(
    () =>
      messages.filter(
        (message) =>
          session &&
          chatPartner &&
          ((message.sender_name === session.person && message.receiver_name === chatPartner) ||
            (message.sender_name === chatPartner && message.receiver_name === session.person))
      ),
    [chatPartner, messages, session]
  );
  const currentCustomRequests = useMemo(
    () =>
      customRequests.filter(
        (request) =>
          session &&
          request.meal_date === mealChoice.date &&
          request.meal_period === mealChoice.period &&
          (isChef ? request.chef_name === session.person : request.customer_name === session.person)
      ),
    [customRequests, isChef, mealChoice.date, mealChoice.period, session]
  );

  const loadData = useCallback(
    async (code = accessCode, silent = true) => {
      if (!code) return;
      if (!silent) setIsRefreshing(true);
      try {
        const [categoryResult, dishResult, orderResult, availabilityResult] = await Promise.all([
          apiFetch<{ categories: DishCategory[] }>("/api/categories", code),
          apiFetch<{ dishes: Dish[] }>("/api/dishes", code),
          apiFetch<{ orders: Order[] }>("/api/orders", code),
          apiFetch<{ availability: DishAvailability[] }>("/api/availability", code)
        ]);
        const [messageResult, customRequestResult] = await Promise.all([
          apiFetch<{ messages: ChatMessage[] }>("/api/messages", code).catch(() => ({ messages: [] })),
          apiFetch<{ requests: CustomDishRequest[] }>("/api/custom-requests", code).catch(() => ({ requests: [] }))
        ]);
        setCategories(categoryResult.categories.map(normalizeCategory));
        setDishes(dishResult.dishes.map(normalizeDish));
        setOrders(orderResult.orders.map(normalizeOrder));
        setAvailability(availabilityResult.availability.map(normalizeAvailability));
        setMessages(messageResult.messages.map(normalizeMessage));
        setCustomRequests(customRequestResult.requests.map(normalizeCustomRequest));
        setBackendMode("supabase");
      } catch {
        const localCategories = readLocal<DishCategory[]>(localCategoriesKey, []).map(normalizeCategory);
        setBackendMode("local");
        setCategories(localCategories);
        setDishes(readLocal<Dish[]>(localDishesKey, []).map(normalizeDish));
        setOrders(readLocal<Order[]>(localOrdersKey, []).map(normalizeOrder));
        setAvailability(readLocal<DishAvailability[]>(localAvailabilityKey, []).map(normalizeAvailability));
        setMessages(readLocal<ChatMessage[]>(localMessagesKey, []).map(normalizeMessage));
        setCustomRequests(readLocal<CustomDishRequest[]>(localCustomRequestsKey, []).map(normalizeCustomRequest));
      } finally {
        if (!silent) setIsRefreshing(false);
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
    const interval = window.setInterval(() => void loadData(accessCode), 8000);
    const syncLocal = () => {
      if (backendMode === "local") {
        setCategories(readLocal<DishCategory[]>(localCategoriesKey, []).map(normalizeCategory));
        setDishes(readLocal<Dish[]>(localDishesKey, []).map(normalizeDish));
        setOrders(readLocal<Order[]>(localOrdersKey, []).map(normalizeOrder));
        setAvailability(readLocal<DishAvailability[]>(localAvailabilityKey, []).map(normalizeAvailability));
        setMessages(readLocal<ChatMessage[]>(localMessagesKey, []).map(normalizeMessage));
        setCustomRequests(readLocal<CustomDishRequest[]>(localCustomRequestsKey, []).map(normalizeCustomRequest));
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

  useEffect(() => {
    if (!editDish?.file) return;
    const url = URL.createObjectURL(editDish.file);
    setEditDish((current) => (current ? { ...current, preview: url } : current));
    return () => URL.revokeObjectURL(url);
  }, [editDish?.file]);

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
    setCart([]);
    setActivePath("all");
    setNotice(`${choice.person} 已进入${choice.role === "chef" ? "厨师台" : "点餐台"}`);
  }

  function logout() {
    window.localStorage.removeItem(sessionKey);
    setSession(null);
    setCart([]);
    setEditDish(null);
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

  async function saveDish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !dishName.trim() || !dishFile) {
      setNotice("菜名和图片都要有，厨师台才会亮起来");
      return;
    }

    setIsSavingDish(true);
    try {
      const imageUrl = await uploadImage(dishFile);
      const categoryPaths = parseCategoryText(categoryText);

      if (backendMode === "local") {
        const ensured = ensureLocalCategories(categoryPaths, session.person, categories);
        const dishCategories = ensured.categories.filter((category) => ensured.ids.includes(category.id));
        const nextDish: Dish = {
          id: localId("dish"),
          name: dishName.trim(),
          image_url: imageUrl,
          created_by: session.person,
          category_id: dishCategories[0]?.id ?? null,
          category_name: dishCategories[0]?.name ?? null,
          categories: dishCategories,
          is_active: true,
          created_at: nowIso(),
          deleted_at: null
        };
        const nextDishes = [nextDish, ...dishes];
        setCategories(ensured.categories);
        setDishes(nextDishes);
        writeLocal(localCategoriesKey, ensured.categories);
        writeLocal(localDishesKey, nextDishes);
      } else {
        await apiFetch<{ dish: Dish }>("/api/dishes", accessCode, {
          method: "POST",
          body: JSON.stringify({
            name: dishName,
            image_url: imageUrl,
            created_by: session.person,
            category_paths: categoryPaths
          })
        });
        await loadData();
      }

      setDishName("");
      setCategoryText("");
      setDishFile(null);
      setNotice("新菜已加入历史菜品库，可选择餐次供应");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存菜品失败");
    } finally {
      setIsSavingDish(false);
    }
  }

  async function saveEditDish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !editDish) return;

    setIsSavingDish(true);
    try {
      const imageUrl = editDish.file ? await uploadImage(editDish.file) : editDish.dish.image_url;
      const categoryPaths = parseCategoryText(editDish.categoryText);

      if (backendMode === "local") {
        const ensured = ensureLocalCategories(categoryPaths, session.person, categories);
        const dishCategories = ensured.categories.filter((category) => ensured.ids.includes(category.id));
        const nextDishes = dishes.map((dish) =>
          dish.id === editDish.dish.id
            ? {
                ...dish,
                name: editDish.name.trim(),
                image_url: imageUrl,
                category_id: dishCategories[0]?.id ?? null,
                category_name: dishCategories[0]?.name ?? null,
                categories: dishCategories
              }
            : dish
        );
        setCategories(ensured.categories);
        setDishes(nextDishes);
        writeLocal(localCategoriesKey, ensured.categories);
        writeLocal(localDishesKey, nextDishes);
      } else {
        await apiFetch<{ dish: Dish }>(`/api/dishes/${editDish.dish.id}`, accessCode, {
          method: "PATCH",
          body: JSON.stringify({
            created_by: session.person,
            name: editDish.name,
            image_url: imageUrl,
            category_paths: categoryPaths
          })
        });
        await loadData();
      }

      setEditDish(null);
      setNotice("菜品信息已更新");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "编辑菜品失败");
    } finally {
      setIsSavingDish(false);
    }
  }

  async function toggleDishActive(dish: Dish) {
    if (backendMode === "local") {
      const nextDishes = dishes.map((item) => (item.id === dish.id ? { ...item, is_active: !dish.is_active } : item));
      const nextAvailability = dish.is_active ? availability.filter((item) => item.dish_id !== dish.id) : availability;
      setDishes(nextDishes);
      setAvailability(nextAvailability);
      writeLocal(localDishesKey, nextDishes);
      writeLocal(localAvailabilityKey, nextAvailability);
      return;
    }
    await apiFetch<{ dish: Dish }>(`/api/dishes/${dish.id}`, accessCode, {
      method: "PATCH",
      body: JSON.stringify({ created_by: session?.person, is_active: !dish.is_active })
    });
    await loadData();
  }

  async function deleteDish(dish: Dish) {
    if (dish.is_active) {
      setNotice("请先停用菜品，再删除");
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
      body: JSON.stringify({ created_by: session?.person, deleted: true })
    });
    await loadData();
  }

  async function toggleSupply(dish: Dish) {
    if (!session) return;
    const isSelected = selectedSupplyIds.has(dish.id);
    const nextIds = isSelected
      ? Array.from(selectedSupplyIds).filter((id) => id !== dish.id)
      : [...Array.from(selectedSupplyIds), dish.id];

    if (backendMode === "local") {
      const nextAvailability = [
        ...availability.filter(
          (item) =>
            !(
              item.chef_name === session.person &&
              item.meal_date === mealChoice.date &&
              item.meal_period === mealChoice.period
            )
        ),
        ...nextIds.map((dishId) => ({
          id: localId("availability"),
          chef_name: session.person,
          dish_id: dishId,
          meal_date: mealChoice.date,
          meal_period: mealChoice.period,
          created_at: nowIso()
        }))
      ];
      setAvailability(nextAvailability);
      writeLocal(localAvailabilityKey, nextAvailability);
      setNotice(`${mealChoice.period}供应菜单已更新`);
      return;
    }

    await apiFetch<{ availability: DishAvailability[] }>("/api/availability", accessCode, {
      method: "PUT",
      body: JSON.stringify({
        chef_name: session.person,
        meal_date: mealChoice.date,
        meal_period: mealChoice.period,
        dish_ids: nextIds
      })
    });
    await loadData();
    setNotice(`${mealChoice.period}供应菜单已更新`);
  }

  function addToCart(dish: Dish) {
    setCart((items) => {
      const existing = items.find((item) => item.dish.id === dish.id);
      if (existing) return items.map((item) => (item.dish.id === dish.id ? { ...item, quantity: item.quantity + 1 } : item));
      return [...items, { dish, quantity: 1, note: "" }];
    });
    setNotice(`${dish.name} 已加入${mealChoice.period}菜单`);
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
        chef_name: item.dish.created_by,
        dish_id: item.dish.id,
        dish_name: item.dish.name,
        dish_image_url: item.dish.image_url,
        quantity: item.quantity,
        note: item.note,
        meal_date: mealChoice.date,
        meal_period: mealChoice.period
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
          review_text: null,
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
      setNotice(`${mealChoice.period}菜单已发送给${selectedChef}`);
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

  async function rateOrder(order: Order, rating: number, reviewText = "") {
    if (order.status !== "已完成") return;
    const timestamp = nowIso();
    if (backendMode === "local") {
      const nextOrders = orders.map((item) =>
        item.id === order.id
          ? { ...item, rating, review_text: reviewText.trim() || null, rated_at: timestamp, updated_at: timestamp }
          : item
      );
      setOrders(nextOrders);
      writeLocal(localOrdersKey, nextOrders);
      return;
    }
    await apiFetch<{ order: Order }>(`/api/orders/${order.id}`, accessCode, {
      method: "PATCH",
      body: JSON.stringify({ rating, review_text: reviewText })
    });
    await loadData();
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !chatPartner || !chatText.trim()) return;
    const text = chatText.trim();
    const createdAt = nowIso();

    if (backendMode === "local") {
      const nextMessages = [
        ...messages,
        {
          id: localId("message"),
          sender_name: session.person,
          receiver_name: chatPartner,
          body: text,
          created_at: createdAt
        }
      ];
      setMessages(nextMessages);
      writeLocal(localMessagesKey, nextMessages);
      setChatText("");
      return;
    }

    await apiFetch<{ message: ChatMessage }>("/api/messages", accessCode, {
      method: "POST",
      body: JSON.stringify({
        sender_name: session.person,
        receiver_name: chatPartner,
        body: text
      })
    });
    setChatText("");
    await loadData();
  }

  async function submitCustomRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !selectedChef) return;
    const hasAnyText = Object.values(customRequestForm).some((value) => value.trim());
    if (!hasAnyText) {
      setNotice("自主点菜至少写一点点想法就能发送");
      return;
    }

    const request: NewCustomDishRequest = {
      customer_name: session.person,
      chef_name: selectedChef,
      dish_name: customRequestForm.dish_name,
      method: customRequestForm.method,
      amount: customRequestForm.amount,
      note: customRequestForm.note,
      meal_date: mealChoice.date,
      meal_period: mealChoice.period
    };

    if (backendMode === "local") {
      const nextRequest: CustomDishRequest = {
        id: localId("custom-request"),
        ...request,
        dish_name: request.dish_name?.trim() || null,
        method: request.method?.trim() || null,
        amount: request.amount?.trim() || null,
        note: request.note?.trim() || null,
        created_at: nowIso()
      };
      const nextRequests = [nextRequest, ...customRequests];
      setCustomRequests(nextRequests);
      writeLocal(localCustomRequestsKey, nextRequests);
    } else {
      await apiFetch<{ request: CustomDishRequest }>("/api/custom-requests", accessCode, {
        method: "POST",
        body: JSON.stringify(request)
      });
      await loadData();
    }

    setCustomRequestForm({ dish_name: "", method: "", amount: "", note: "" });
    setNotice(`想吃的已经发给${selectedChef}`);
  }

  async function clearFinishedHistory(scope: "chef" | "mine") {
    if (!session) return;
    if (backendMode === "local") {
      const nextOrders = orders.filter((order) => {
        const done = order.status === "已完成" || order.status === "已拒绝";
        if (!done) return true;
        if (scope === "mine") return order.customer_name !== session.person;
        return order.chef_name !== session.person;
      });
      setOrders(nextOrders);
      writeLocal(localOrdersKey, nextOrders);
      setNotice("已结束历史已清除");
      return;
    }
    const query = scope === "mine" ? `?customer=${encodeURIComponent(session.person)}` : "?all=true";
    await apiFetch<{ ok: boolean }>(`/api/orders${query}`, accessCode, { method: "DELETE" });
    await loadData();
    setNotice("已结束历史已清除");
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
            {PEOPLE.map((person) => <Avatar key={person} person={person} size="lg" />)}
          </div>
          <div className="glass-panel p-6 shadow-soft">
            <div className="mb-6 text-center">
              <p className="section-kicker">Private kitchen link</p>
              <h1 className="mt-3 text-3xl font-black text-slate-950">点菜舱启动</h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">输入共享访问码，进入你们俩的双向小厨房。</p>
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
            mealChoice={mealChoice}
            onRefresh={() => loadData(accessCode, false)}
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
          subtitle={`${session.person} / ${isChef ? "管理自己的菜" : `点 ${otherPerson(session.person)} 的菜`}`}
          notice={notice}
          mode={backendMode}
          mealChoice={mealChoice}
          person={session.person}
          onRefresh={() => loadData(accessCode, false)}
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
            person={session.person}
            mealChoice={mealChoice}
            categories={categories}
            chefTags={chefTags}
            activePath={activePath}
            activeDishes={activeChefDishes}
            inactiveDishes={inactiveChefDishes}
            supplyIds={selectedSupplyIds}
            unfinishedOrders={unfinishedOrders}
            finishedOrders={finishedOrders}
            customRequests={currentCustomRequests}
            messages={conversationMessages}
            chatText={chatText}
            dishName={dishName}
            categoryText={categoryText}
            dishPreview={dishPreview}
            editDish={editDish}
            isSavingDish={isSavingDish}
            onMealChoiceChange={setMealChoice}
            onActivePathChange={setActivePath}
            onDishNameChange={setDishName}
            onCategoryTextChange={setCategoryText}
            onFileChange={onFileChange}
            onSaveDish={saveDish}
            onToggleSupply={toggleSupply}
            onToggleDishActive={toggleDishActive}
            onDeleteDish={deleteDish}
            onStartEdit={(dish) => setEditDish({ dish, name: dish.name, categoryText: categoriesToText(dish.categories), file: null, preview: dish.image_url })}
            onEditDishChange={setEditDish}
            onSaveEditDish={saveEditDish}
            onCancelEdit={() => setEditDish(null)}
            onUpdateOrderStatus={updateOrderStatus}
            onClearHistory={() => clearFinishedHistory("chef")}
            onChatTextChange={setChatText}
            onSendMessage={sendMessage}
          />
        ) : (
          <CustomerDashboard
            person={session.person}
            chef={otherPerson(session.person)}
            mealChoice={mealChoice}
            tags={customerTags}
            activePath={activePath}
            dishes={filteredCustomerDishes}
            rawDishCount={customerMenuDishes.length}
            cart={cart}
            currentOrders={currentOrders}
            finishedOrders={finishedOrders}
            customRequests={currentCustomRequests}
            messages={conversationMessages}
            chatText={chatText}
            customRequestForm={customRequestForm}
            isSubmittingOrder={isSubmittingOrder}
            onMealChoiceChange={setMealChoice}
            onActivePathChange={setActivePath}
            onAddToCart={addToCart}
            onUpdateCart={updateCart}
            onSubmitOrders={submitOrders}
            onRateOrder={rateOrder}
            onClearHistory={() => clearFinishedHistory("mine")}
            onChatTextChange={setChatText}
            onSendMessage={sendMessage}
            onCustomRequestChange={setCustomRequestForm}
            onSubmitCustomRequest={submitCustomRequest}
          />
        )}
      </section>
    </main>
  );
}

function collectTags(dishes: Dish[]) {
  const map = new Map<string, DishCategory>();
  for (const dish of dishes) {
    for (const category of dish.categories) map.set(category.id, category);
  }
  return Array.from(map.values()).sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b), "zh-CN"));
}

function TopBar({
  title,
  subtitle,
  notice,
  mode,
  action,
  isRefreshing,
  mealChoice,
  person,
  onRefresh
}: {
  title: string;
  subtitle: string;
  notice: string;
  mode: BackendMode;
  action?: ReactNode;
  isRefreshing: boolean;
  mealChoice: MealChoice;
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
          <p className="mt-1 text-xs font-bold text-pink-500">{mealChoice.date} / {mealChoice.period}</p>
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

function CollapsiblePanel({
  kicker,
  title,
  count,
  icon,
  defaultOpen = false,
  children
}: {
  kicker: string;
  title: string;
  count?: string;
  icon?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="glass-panel collapsible-panel" open={defaultOpen}>
      <summary className="collapsible-summary">
        <span className="min-w-0">
          <span className="section-kicker">{kicker}</span>
          <span className="mt-1 block truncate text-xl font-black text-slate-950">{title}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {count ? <span className="mini-badge">{count}</span> : null}
          {icon}
          <ChevronDown className="collapsible-arrow" size={18} />
        </span>
      </summary>
      <div className="collapsible-body">{children}</div>
    </details>
  );
}

function MealSelector({ value, onChange }: { value: MealChoice; onChange: (next: MealChoice) => void }) {
  return (
    <div className="glass-panel p-4">
      <div className="grid gap-3 sm:grid-cols-[9.5rem_1fr] sm:items-end">
        <div>
          <label className="field-label" htmlFor="meal-date">日期</label>
          <input
            id="meal-date"
            className="text-input"
            type="date"
            value={value.date}
            onChange={(event) => onChange({ ...value, date: event.target.value })}
          />
        </div>
        <div>
          <p className="field-label">餐次</p>
          <div className="segmented-control">
            {MEAL_PERIODS.map((period) => (
              <button
                key={period}
                className={value.period === period ? "segment-active" : "segment-button"}
                onClick={() => onChange({ ...value, period })}
              >
                {period}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CategoryNavigator({
  categories,
  activePath,
  onChange
}: {
  categories: DishCategory[];
  activePath: string;
  onChange: (value: string) => void;
}) {
  const picked = keyToPath(activePath);
  const depth = picked.length;
  const nextOptions = unique(
    categories
      .filter((category) => picked.every((part, index) => category.path[index] === part))
      .map((category) => category.path[depth])
  );
  const breadcrumb = picked.map((part, index) => ({
    label: part,
    key: pathKey(picked.slice(0, index + 1))
  }));

  return (
    <div className="space-y-3">
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        <button className={activePath === "all" ? "tag-chip-active" : "tag-chip"} onClick={() => onChange("all")}>
          全部
        </button>
        {breadcrumb.map((item, index) => (
          <button key={item.key} className="tag-chip-active" onClick={() => onChange(item.key)}>
            {index > 0 ? " / " : ""}
            {item.label}
          </button>
        ))}
      </div>
      <div className="category-menu-panel">
        {nextOptions.length === 0 ? (
          <p className="px-1 text-sm font-semibold text-slate-500">已经到最细分类，下面显示对应菜品。</p>
        ) : (
          nextOptions.map((option) => {
            const nextPath = [...picked, option];
            return (
              <button key={pathKey(nextPath)} className="category-menu-button" onClick={() => onChange(pathKey(nextPath))}>
                {option}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function CategoryPathBuilder({
  categories,
  value,
  onChange
}: {
  categories: DishCategory[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [level1, setLevel1] = useState("");
  const [level2, setLevel2] = useState("");
  const [level3, setLevel3] = useState("");
  const selectedPaths = parseCategoryText(value);
  const level1Options = unique(categories.map((category) => category.path[0]));
  const level2Options = unique(
    categories.filter((category) => category.path[0] === level1).map((category) => category.path[1])
  );
  const level3Options = unique(
    categories
      .filter((category) => category.path[0] === level1 && category.path[1] === level2)
      .map((category) => category.path[2])
  );

  function addPath() {
    const path = [level1, level2, level3].map((item) => item.trim()).filter(Boolean).slice(0, 3);
    if (path.length === 0) return;
    const exists = selectedPaths.some((item) => pathKey(item) === pathKey(path));
    const next = exists ? selectedPaths : [...selectedPaths, path];
    onChange(next.map((item) => item.join("/")).join("，"));
    setLevel1("");
    setLevel2("");
    setLevel3("");
  }

  function removePath(target: string[]) {
    const next = selectedPaths.filter((item) => pathKey(item) !== pathKey(target));
    onChange(next.map((item) => item.join("/")).join("，"));
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <CategoryCombo id="category-level-1" label="一级目录" value={level1} options={level1Options} placeholder="如：素菜" onChange={(next) => { setLevel1(next); setLevel2(""); setLevel3(""); }} />
        <CategoryCombo id="category-level-2" label="二级目录" value={level2} options={level2Options} placeholder="如：青菜" onChange={(next) => { setLevel2(next); setLevel3(""); }} />
        <CategoryCombo id="category-level-3" label="三级目录" value={level3} options={level3Options} placeholder="如：清炒" onChange={setLevel3} />
      </div>
      <button type="button" className="ghost-button w-full" onClick={addPath}>
        <Plus size={16} />
        加入这个分类
      </button>
      <div className="flex flex-wrap gap-2">
        {selectedPaths.length === 0 ? (
          <span className="text-sm font-semibold text-slate-500">还没选择分类，默认会进入“未分类”。</span>
        ) : (
          selectedPaths.map((path) => (
            <button key={pathKey(path)} type="button" className="selected-category-pill" onClick={() => removePath(path)}>
              {path.join(" / ")}
              <X size={13} />
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function CategoryCombo({
  id,
  label,
  value,
  options,
  placeholder,
  onChange
}: {
  id: string;
  label: string;
  value: string;
  options: string[];
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="field-label" htmlFor={id}>{label}</label>
      <input
        id={id}
        className="text-input"
        list={`${id}-list`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
      <datalist id={`${id}-list`}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </div>
  );
}

function ChefDashboard(props: {
  person: PersonName;
  mealChoice: MealChoice;
  categories: DishCategory[];
  chefTags: DishCategory[];
  activePath: string;
  activeDishes: Dish[];
  inactiveDishes: Dish[];
  supplyIds: Set<string>;
  unfinishedOrders: Order[];
  finishedOrders: Order[];
  customRequests: CustomDishRequest[];
  messages: ChatMessage[];
  chatText: string;
  dishName: string;
  categoryText: string;
  dishPreview: string;
  editDish: EditDishState | null;
  isSavingDish: boolean;
  onMealChoiceChange: (value: MealChoice) => void;
  onActivePathChange: (value: string) => void;
  onDishNameChange: (value: string) => void;
  onCategoryTextChange: (value: string) => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSaveDish: (event: FormEvent<HTMLFormElement>) => void;
  onToggleSupply: (dish: Dish) => void;
  onToggleDishActive: (dish: Dish) => void;
  onDeleteDish: (dish: Dish) => void;
  onStartEdit: (dish: Dish) => void;
  onEditDishChange: (value: EditDishState | null) => void;
  onSaveEditDish: (event: FormEvent<HTMLFormElement>) => void;
  onCancelEdit: () => void;
  onUpdateOrderStatus: (order: Order, status: OrderStatus) => void;
  onClearHistory: () => void;
  onChatTextChange: (value: string) => void;
  onSendMessage: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const filteredActiveDishes = props.activeDishes.filter(
    (dish) => dishMatchesPath(dish, props.activePath)
  );

  return (
    <div className="mt-5 grid gap-5 xl:grid-cols-[0.9fr_1fr_0.8fr]">
      <section className="space-y-5">
        <MealSelector value={props.mealChoice} onChange={props.onMealChoiceChange} />

        <section className="glass-panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="section-kicker">Serving now</p>
              <h2 className="section-title">{props.mealChoice.period}供应菜品</h2>
            </div>
            <span className="mini-badge">{props.supplyIds.size} 道</span>
          </div>
          <div className="grid gap-3">
            {filteredActiveDishes.length === 0 ? (
              <EmptyState text="历史菜品库还没有可供应菜品。" />
            ) : (
              filteredActiveDishes.map((dish) => (
                <DishRow
                  key={dish.id}
                  dish={dish}
                  supplySelected={props.supplyIds.has(dish.id)}
                  onToggleSupply={() => props.onToggleSupply(dish)}
                  onToggleActive={() => props.onToggleDishActive(dish)}
                  onEdit={() => props.onStartEdit(dish)}
                />
              ))
            )}
          </div>
        </section>

        <CollapsiblePanel kicker="Dish archive" title="历史菜品筛选" count={props.chefTags.length ? `${props.chefTags.length} 类` : undefined}>
          <CategoryNavigator categories={props.chefTags} activePath={props.activePath} onChange={props.onActivePathChange} />
        </CollapsiblePanel>

        <form onSubmit={props.onSaveDish} className="glass-panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="section-kicker">Add dish</p>
              <h2 className="section-title">新增历史菜品</h2>
            </div>
            <Store className="text-pink-500" size={25} />
          </div>
          <div className="grid gap-4">
            <div>
              <label className="field-label" htmlFor="dish-name">菜品名称</label>
              <input id="dish-name" className="text-input" value={props.dishName} onChange={(event) => props.onDishNameChange(event.target.value)} placeholder="比如：清蒸鸡腿" />
            </div>
            <div>
              <p className="field-label">所属分类</p>
              <CategoryPathBuilder categories={props.chefTags} value={props.categoryText} onChange={props.onCategoryTextChange} />
            </div>
            <label className="upload-box">
              {props.dishPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={props.dishPreview} alt="菜品预览" className="h-full w-full rounded-[22px] object-cover" />
              ) : (
                <span className="flex flex-col items-center gap-2 text-slate-500">
                  <Camera size={28} />
                  上传菜品图片
                </span>
              )}
              <input className="sr-only" type="file" accept="image/*" onChange={props.onFileChange} />
            </label>
            <button className="primary-button w-full" disabled={props.isSavingDish} type="submit">
              {props.isSavingDish ? <Loader2 className="animate-spin" size={18} /> : <Cloud size={18} />}
              保存到历史菜品库
            </button>
          </div>
        </form>

        {props.editDish ? (
          <form onSubmit={props.onSaveEditDish} className="glass-panel p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="section-kicker">Edit dish</p>
                <h2 className="section-title">修改菜品信息</h2>
              </div>
              <button className="ghost-icon-button" type="button" onClick={props.onCancelEdit} aria-label="关闭编辑">
                <X size={17} />
              </button>
            </div>
            <div className="grid gap-4">
              <input className="text-input" value={props.editDish.name} onChange={(event) => props.onEditDishChange({ ...props.editDish!, name: event.target.value })} />
              <CategoryPathBuilder
                categories={props.chefTags}
                value={props.editDish.categoryText}
                onChange={(next) => props.onEditDishChange({ ...props.editDish!, categoryText: next })}
              />
              <label className="upload-box">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={props.editDish.preview || props.editDish.dish.image_url} alt="编辑预览" className="h-full w-full rounded-[22px] object-cover" />
                <input
                  className="sr-only"
                  type="file"
                  accept="image/*"
                  onChange={(event) => props.onEditDishChange({ ...props.editDish!, file: event.target.files?.[0] ?? null })}
                />
              </label>
              <button className="primary-button w-full" disabled={props.isSavingDish} type="submit">
                <Save size={18} />
                保存修改
              </button>
            </div>
          </form>
        ) : null}

        <CollapsiblePanel kicker="Paused archive" title="停用菜品" count={`${props.inactiveDishes.length} 道`}>
          <div className="grid gap-3">
            {props.inactiveDishes.length === 0 ? (
              <EmptyState text="停用后的历史菜品会在这里，可恢复或删除。" />
            ) : (
              props.inactiveDishes.map((dish) => (
                <DishRow
                  key={dish.id}
                  dish={dish}
                  onToggleActive={() => props.onToggleDishActive(dish)}
                  onDelete={() => props.onDeleteDish(dish)}
                />
              ))
            )}
          </div>
        </CollapsiblePanel>
      </section>

      <OrderPanels
        title={`${props.mealChoice.period}收到的订单`}
        unfinishedOrders={props.unfinishedOrders}
        finishedOrders={props.finishedOrders}
        showCustomer
        chefMode
        onUpdateOrderStatus={props.onUpdateOrderStatus}
        onClearHistory={props.onClearHistory}
      />
      <section className="space-y-5">
        <CustomRequestInbox requests={props.customRequests} />
        <ChatPanel
          person={props.person}
          partner={otherPerson(props.person)}
          messages={props.messages}
          value={props.chatText}
          onChange={props.onChatTextChange}
          onSubmit={props.onSendMessage}
        />
      </section>
    </div>
  );
}

function CustomerDashboard(props: {
  person: PersonName;
  chef: PersonName;
  mealChoice: MealChoice;
  tags: DishCategory[];
  activePath: string;
  dishes: Dish[];
  rawDishCount: number;
  cart: CartItem[];
  currentOrders: Order[];
  finishedOrders: Order[];
  customRequests: CustomDishRequest[];
  messages: ChatMessage[];
  chatText: string;
  customRequestForm: CustomRequestForm;
  isSubmittingOrder: boolean;
  onMealChoiceChange: (value: MealChoice) => void;
  onActivePathChange: (value: string) => void;
  onAddToCart: (dish: Dish) => void;
  onUpdateCart: (dishId: string, patch: Partial<CartItem>) => void;
  onSubmitOrders: () => void;
  onRateOrder: (order: Order, rating: number, reviewText?: string) => void;
  onClearHistory: () => void;
  onChatTextChange: (value: string) => void;
  onSendMessage: (event: FormEvent<HTMLFormElement>) => void;
  onCustomRequestChange: (value: CustomRequestForm) => void;
  onSubmitCustomRequest: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const unfinished = props.currentOrders.filter((order) => order.status === "未完成");
  const currentFinished = props.currentOrders.filter((order) => order.status !== "未完成");

  return (
    <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
      <section className="space-y-5">
        <MealSelector value={props.mealChoice} onChange={props.onMealChoiceChange} />
        <section className="glass-panel p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="section-kicker">Cute tech menu</p>
              <h2 className="section-title">点 {props.chef} 的{props.mealChoice.period}</h2>
            </div>
            <span className="mini-badge">{props.rawDishCount} 道供应</span>
          </div>
          <CategoryNavigator categories={props.tags} activePath={props.activePath} onChange={props.onActivePathChange} />
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {props.dishes.length === 0 ? (
              <EmptyState text={`${props.chef} 当前餐次还没有供应符合标签的菜。`} />
            ) : (
              props.dishes.map((dish) => <DishCard key={dish.id} dish={dish} onAdd={() => props.onAddToCart(dish)} />)
            )}
          </div>
        </section>
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
            {props.cart.length === 0 ? (
              <EmptyState text={`把 ${props.chef} 供应的菜加入${props.mealChoice.period}菜单吧。`} />
            ) : (
              props.cart.map((item) => <CartRow key={item.dish.id} item={item} onUpdate={(patch) => props.onUpdateCart(item.dish.id, patch)} />)
            )}
          </div>
          <button className="primary-button mt-4 w-full" disabled={props.cart.length === 0 || props.isSubmittingOrder} onClick={props.onSubmitOrders}>
            {props.isSubmittingOrder ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
            发送给厨师
          </button>
        </section>

        <CustomDishRequestPanel
          chef={props.chef}
          mealChoice={props.mealChoice}
          form={props.customRequestForm}
          requests={props.customRequests}
          onChange={props.onCustomRequestChange}
          onSubmit={props.onSubmitCustomRequest}
        />

        <ChatPanel
          person={props.person}
          partner={props.chef}
          messages={props.messages}
          value={props.chatText}
          onChange={props.onChatTextChange}
          onSubmit={props.onSendMessage}
        />

        <section className="glass-panel p-5">
          <div className="mb-4">
            <p className="section-kicker">Current period</p>
            <h2 className="section-title">{props.mealChoice.period}订单</h2>
          </div>
          <div className="grid gap-3">
            {[...unfinished, ...currentFinished].length === 0 ? (
              <EmptyState text={`当前${props.mealChoice.period}还没有订单。`} />
            ) : (
              [...unfinished, ...currentFinished].map((order) => (
                <OrderCard key={order.id} order={order} onRateOrder={(rating, reviewText) => props.onRateOrder(order, rating, reviewText)} />
              ))
            )}
          </div>
        </section>

        <CollapsiblePanel kicker="History" title="我的已结束历史" count={`${props.finishedOrders.length} 条`}>
          <HistoryActions count={props.finishedOrders.length} onClearHistory={props.onClearHistory} />
          <div className="grid gap-3">
            {props.finishedOrders.length === 0 ? (
              <EmptyState text="完成或拒绝后的历史会在这里。" />
            ) : (
              props.finishedOrders.map((order) => (
                <OrderCard key={order.id} order={order} onRateOrder={(rating, reviewText) => props.onRateOrder(order, rating, reviewText)} />
              ))
            )}
          </div>
        </CollapsiblePanel>
      </aside>
    </div>
  );
}

function OrderPanels({
  title,
  unfinishedOrders,
  finishedOrders,
  showCustomer,
  chefMode,
  onUpdateOrderStatus,
  onClearHistory
}: {
  title: string;
  unfinishedOrders: Order[];
  finishedOrders: Order[];
  showCustomer?: boolean;
  chefMode?: boolean;
  onUpdateOrderStatus: (order: Order, status: OrderStatus) => void;
  onClearHistory: () => void;
}) {
  return (
    <section className="space-y-5">
      <section className="glass-panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="section-kicker">Orders incoming</p>
            <h2 className="section-title">{title}</h2>
          </div>
          <div className={unfinishedOrders.length > 0 ? "alarm-badge" : "mini-badge"}>
            <Bell size={15} />
            {unfinishedOrders.length} 待处理
          </div>
        </div>
        <div className="grid gap-3">
          {unfinishedOrders.length === 0 ? (
            <EmptyState text="当前餐次还没有待处理订单。" />
          ) : (
            unfinishedOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                showCustomer={showCustomer}
                chefMode={chefMode}
                onUpdateStatus={(status) => onUpdateOrderStatus(order, status)}
              />
            ))
          )}
        </div>
      </section>

      <CollapsiblePanel kicker="History" title="已结束订单" count={`${finishedOrders.length} 条`}>
        <HistoryActions count={finishedOrders.length} onClearHistory={onClearHistory} />
        <div className="grid gap-3">
          {finishedOrders.length === 0 ? (
            <EmptyState text="完成或拒绝的订单会进入这里。" />
          ) : (
            finishedOrders.map((order) => <OrderCard key={order.id} order={order} showCustomer={showCustomer} />)
          )}
        </div>
      </CollapsiblePanel>
    </section>
  );
}

function DishCard({ dish, onAdd }: { dish: Dish; onAdd: () => void }) {
  return (
    <article className="dish-card">
      <div className="relative aspect-[4/3] overflow-hidden rounded-[24px] bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dish.image_url} alt={dish.name} className="h-full w-full object-cover" />
        <div className="absolute left-3 top-3 rounded-full bg-white/80 px-3 py-1 text-xs font-bold text-pink-700 backdrop-blur">
          {dish.created_by}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <h3 className="min-w-0 break-words text-lg font-black text-slate-950">{dish.name}</h3>
        <button className="round-button" onClick={onAdd} aria-label={`加入 ${dish.name}`}>
          <Plus size={19} />
        </button>
      </div>
      <CategoryBadges categories={dish.categories} />
    </article>
  );
}

function DishRow({
  dish,
  supplySelected,
  onToggleSupply,
  onToggleActive,
  onEdit,
  onDelete
}: {
  dish: Dish;
  supplySelected?: boolean;
  onToggleSupply?: () => void;
  onToggleActive: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <article className="rounded-[22px] border border-white/70 bg-white/55 p-3">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dish.image_url} alt={dish.name} className="h-16 w-16 rounded-2xl object-cover" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-black text-slate-950">{dish.name}</h3>
          <p className="text-xs text-slate-500">厨师：{dish.created_by}</p>
        </div>
        {onToggleSupply ? (
          <button className={supplySelected ? "toggle-on" : "toggle-off"} onClick={onToggleSupply}>
            {supplySelected ? "供应中" : "供应"}
          </button>
        ) : null}
        <button className={dish.is_active ? "toggle-on" : "toggle-off"} onClick={onToggleActive}>
          {dish.is_active ? "停用" : "恢复"}
        </button>
        {onEdit ? (
          <button className="ghost-icon-button" onClick={onEdit} aria-label={`编辑 ${dish.name}`}>
            <Edit3 size={16} />
          </button>
        ) : null}
        {onDelete ? (
          <button className="danger-icon-button" onClick={onDelete} aria-label={`删除 ${dish.name}`}>
            <Trash2 size={16} />
          </button>
        ) : null}
      </div>
      <CategoryBadges categories={dish.categories} />
    </article>
  );
}

function CategoryBadges({ categories }: { categories: DishCategory[] }) {
  if (categories.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {categories.map((category) => (
        <span className="category-badge" key={category.id}>
          {categoryLabel(category)}
        </span>
      ))}
    </div>
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
      <input className="note-input mt-3" value={item.note} onChange={(event) => onUpdate({ note: event.target.value })} placeholder="备注：少糖/多辣/要爱心摆盘" />
    </article>
  );
}

function CustomDishRequestPanel({
  chef,
  mealChoice,
  form,
  requests,
  onChange,
  onSubmit
}: {
  chef: PersonName;
  mealChoice: MealChoice;
  form: CustomRequestForm;
  requests: CustomDishRequest[];
  onChange: (value: CustomRequestForm) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <CollapsiblePanel
      kicker="Free order"
      title="我想单点"
      count={requests.length ? `${requests.length} 条` : undefined}
      icon={<NotebookPen className="text-pink-500" size={22} />}
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <input
          className="text-input"
          value={form.dish_name}
          onChange={(event) => onChange({ ...form, dish_name: event.target.value })}
          placeholder="菜品名称：比如番茄炒蛋"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            className="text-input"
            value={form.method}
            onChange={(event) => onChange({ ...form, method: event.target.value })}
            placeholder="做法：清炒/少油/辣炒"
          />
          <input
            className="text-input"
            value={form.amount}
            onChange={(event) => onChange({ ...form, amount: event.target.value })}
            placeholder="用量：一人份/多一点"
          />
        </div>
        <textarea
          className="note-textarea"
          value={form.note}
          onChange={(event) => onChange({ ...form, note: event.target.value })}
          placeholder="其他想法：不确定也可以只写一句“想吃热乎的”。"
        />
        <button className="primary-button w-full" type="submit">
          <Send size={18} />
          发给 {chef}
        </button>
      </form>
      <div className="mt-4 grid gap-2">
        {requests.length === 0 ? (
          <EmptyState text={`${mealChoice.period}还没有自主点菜。`} />
        ) : (
          requests.map((request) => <CustomRequestCard key={request.id} request={request} />)
        )}
      </div>
    </CollapsiblePanel>
  );
}

function CustomRequestInbox({ requests }: { requests: CustomDishRequest[] }) {
  return (
    <CollapsiblePanel kicker="Wish list" title="顾客想吃" count={`${requests.length} 条`} icon={<NotebookPen className="text-pink-500" size={22} />}>
      <div className="grid gap-3">
        {requests.length === 0 ? (
          <EmptyState text="顾客自主点的菜会出现在这里。" />
        ) : (
          requests.map((request) => <CustomRequestCard key={request.id} request={request} showCustomer />)
        )}
      </div>
    </CollapsiblePanel>
  );
}

function CustomRequestCard({ request, showCustomer = false }: { request: CustomDishRequest; showCustomer?: boolean }) {
  const title = request.dish_name || request.method || request.note || "想吃点特别的";
  return (
    <article className="rounded-[22px] border border-white/75 bg-white/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words font-black text-slate-950">{title}</h3>
          <p className="mt-1 text-xs font-bold text-slate-500">
            {formatTime(request.created_at)} / {request.meal_period}
            {showCustomer ? ` / ${request.customer_name}` : ""}
          </p>
        </div>
        <NotebookPen className="shrink-0 text-pink-500" size={18} />
      </div>
      <div className="mt-3 grid gap-1.5 text-sm font-semibold text-slate-600">
        {request.dish_name ? <p>菜名：{request.dish_name}</p> : null}
        {request.method ? <p>做法：{request.method}</p> : null}
        {request.amount ? <p>用量：{request.amount}</p> : null}
        {request.note ? <p className="text-pink-600">想法：{request.note}</p> : null}
      </div>
    </article>
  );
}

function ChatPanel({
  person,
  partner,
  messages,
  value,
  onChange,
  onSubmit
}: {
  person: PersonName;
  partner: PersonName;
  messages: ChatMessage[];
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const recentMessages = messages.slice(-30);
  return (
    <CollapsiblePanel
      kicker="Live chat"
      title={`和 ${partner} 说一下`}
      count={messages.length ? `${messages.length} 条` : undefined}
      icon={<MessageCircle className="text-pink-500" size={22} />}
    >
      <div className="chat-window">
        {recentMessages.length === 0 ? (
          <p className="py-8 text-center text-sm font-semibold text-slate-500">还没有聊天，第一句话可以很短。</p>
        ) : (
          recentMessages.map((message) => {
            const mine = message.sender_name === person;
            return (
              <div key={message.id} className={mine ? "chat-row-mine" : "chat-row"}>
                <div className={mine ? "chat-bubble-mine" : "chat-bubble"}>
                  <p>{message.body}</p>
                  <span>{formatTime(message.created_at)}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
      <form onSubmit={onSubmit} className="mt-3 flex gap-2">
        <input
          className="text-input min-w-0 flex-1"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="比如：这个少放点辣"
        />
        <button className="round-button h-12 w-12" type="submit" aria-label="发送聊天">
          <Send size={18} />
        </button>
      </form>
    </CollapsiblePanel>
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
  onRateOrder?: (rating: number, reviewText?: string) => void;
}) {
  const [reviewText, setReviewText] = useState(order.review_text ?? "");
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
          <p className="mt-1 text-xs font-semibold text-slate-500">点单：{formatTime(order.created_at)} / {order.meal_period}</p>
          {order.note ? <p className="mt-1 text-sm text-pink-600">备注：{order.note}</p> : null}
          {order.rating ? <StarRating value={order.rating} readonly /> : null}
          {order.review_text ? <p className="mt-2 rounded-2xl bg-pink-50/80 px-3 py-2 text-sm font-semibold text-pink-700">评语：{order.review_text}</p> : null}
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
      {canRate ? (
        <div className="mt-3 rounded-2xl border border-white/75 bg-white/45 p-3">
          <textarea
            className="note-textarea"
            value={reviewText}
            onChange={(event) => setReviewText(event.target.value)}
            placeholder="评语可以不写，比如：今天这个太香了"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <StarRating value={order.rating ?? 0} onRate={(rating) => onRateOrder?.(rating, reviewText)} />
            {order.rating ? <span className="text-xs font-bold text-slate-500">已评价，可重新点星更新</span> : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function StarRating({ value, readonly = false, onRate }: { value: number; readonly?: boolean; onRate?: (rating: number) => void }) {
  return (
    <div className="mt-3 flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button key={star} className={star <= value ? "star-button-on" : "star-button"} onClick={() => onRate?.(star)} disabled={readonly} aria-label={`${star} 星`}>
          <Star size={16} fill="currentColor" />
        </button>
      ))}
    </div>
  );
}

function HistoryActions({ count, onClearHistory }: { count: number; onClearHistory: () => void }) {
  return (
    <div className="mb-3 flex justify-end">
      <button className="danger-button" disabled={count === 0} onClick={onClearHistory}>
        <Trash2 size={15} />
        清除历史
      </button>
    </div>
  );
}

function Avatar({ person, size }: { person: PersonName; size: "sm" | "md" | "lg" }) {
  const className = size === "lg" ? "avatar avatar-lg" : size === "md" ? "avatar avatar-md" : "avatar avatar-sm";
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
      <div className="absolute inset-0 bg-[#fffaf8]" />
      <div className="absolute inset-0 bg-[url('/background-menu.jpg')] bg-cover bg-center opacity-75" />
      <div className="absolute inset-0 bg-white/48" />
      <div className="absolute inset-0 opacity-[0.18] [background-image:radial-gradient(rgba(244,114,182,.45)_1px,transparent_1px)] [background-size:18px_18px]" />
    </div>
  );
}
