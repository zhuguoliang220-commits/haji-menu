export const PEOPLE = ["哈基工", "哈吉梁"] as const;
export const ROLES = ["chef", "customer"] as const;
export const ORDER_STATUSES = ["收到", "制作中", "完成"] as const;

export type PersonName = (typeof PEOPLE)[number];
export type Role = (typeof ROLES)[number];
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type Dish = {
  id: string;
  name: string;
  image_url: string;
  created_by: PersonName;
  is_active: boolean;
  created_at: string;
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
  created_at: string;
  updated_at: string;
};

export type NewDish = {
  name: string;
  image_url: string;
  created_by: PersonName;
};

export type NewOrder = {
  customer_name: PersonName;
  dish_id: string;
  dish_name: string;
  dish_image_url: string;
  quantity: number;
  note?: string;
};

export type SessionChoice = {
  person: PersonName;
  role: Role;
};
