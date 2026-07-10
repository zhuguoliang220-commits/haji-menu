export const PEOPLE = ["哈基工", "哈吉梁"] as const;
export const ROLES = ["chef", "customer"] as const;
export const ORDER_STATUSES = ["未完成", "已完成", "已拒绝"] as const;
export const MEAL_PERIODS = ["早餐", "午饭", "晚饭", "夜宵"] as const;

export type PersonName = (typeof PEOPLE)[number];
export type Role = (typeof ROLES)[number];
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type MealPeriod = (typeof MEAL_PERIODS)[number];

export type DishCategory = {
  id: string;
  name: string;
  path: string[];
  created_by: PersonName;
  created_at: string;
};

export type DishTag = DishCategory;

export type DishAvailability = {
  id: string;
  chef_name: PersonName;
  dish_id: string;
  meal_date: string;
  meal_period: MealPeriod;
  created_at: string;
};

export type Dish = {
  id: string;
  name: string;
  image_url: string;
  created_by: PersonName;
  category_id: string | null;
  category_name?: string | null;
  categories: DishCategory[];
  is_active: boolean;
  created_at: string;
  deleted_at: string | null;
};

export type Order = {
  id: string;
  customer_name: PersonName;
  dish_id: string;
  dish_name: string;
  dish_image_url: string;
  quantity: number;
  note: string | null;
  status: OrderStatus;
  meal_date: string;
  meal_period: MealPeriod;
  chef_name: PersonName | null;
  completed_at: string | null;
  rejected_at: string | null;
  rating: number | null;
  review_text: string | null;
  rated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type NewDish = {
  name: string;
  image_url: string;
  created_by: PersonName;
  category_id?: string | null;
  category_name?: string;
  category_ids?: string[];
  category_paths?: string[][];
};

export type NewOrder = {
  customer_name: PersonName;
  dish_id: string;
  dish_name: string;
  dish_image_url: string;
  quantity: number;
  note?: string;
  meal_date: string;
  meal_period: MealPeriod;
  chef_name: PersonName;
};

export type SessionChoice = {
  person: PersonName;
  role: Role;
};

export type ChatMessage = {
  id: string;
  sender_name: PersonName;
  receiver_name: PersonName;
  body: string;
  created_at: string;
  read_at: string | null;
};

export type ChefStarStats = {
  chef_name: PersonName;
  today_stars: number;
  total_stars: number;
};

export type CustomDishRequest = {
  id: string;
  customer_name: PersonName;
  chef_name: PersonName;
  dish_name: string | null;
  method: string | null;
  amount: string | null;
  note: string | null;
  meal_date: string;
  meal_period: MealPeriod;
  created_at: string;
};

export type NewCustomDishRequest = {
  customer_name: PersonName;
  chef_name: PersonName;
  dish_name?: string;
  method?: string;
  amount?: string;
  note?: string;
  meal_date: string;
  meal_period: MealPeriod;
};
