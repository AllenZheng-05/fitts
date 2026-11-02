export type Category = 'Pizzas' | 'Small Plates' | 'Salads' | 'Pastas' | 'Desserts' | 'Drinks'
export type Dietary = 'vegetarian' | 'vegan' | 'gluten-free' | 'spicy'

export interface MenuItem {
  id: string
  name: string
  description: string
  price: number
  category: Category
  dietary: Dietary[]
  popular?: boolean
  hue: number // for the card visual
  ingredients: string[]
}

export const CATEGORIES: Category[] = ['Pizzas', 'Small Plates', 'Salads', 'Pastas', 'Desserts', 'Drinks']

export const MENU: MenuItem[] = [
  { id: 'margherita', name: 'Margherita Classica', description: 'San Marzano tomato, fior di latte, torn basil, cold-pressed olive oil on a blistered 48-hour crust.', price: 14, category: 'Pizzas', dietary: ['vegetarian'], popular: true, hue: 12, ingredients: ['San Marzano tomato', 'Fior di latte', 'Basil', 'Olive oil'] },
  { id: 'ember-pepperoni', name: 'Ember Pepperoni', description: 'Cup-and-char pepperoni, smoked mozzarella, Calabrian honey, oregano. Our most ordered pie.', price: 17, category: 'Pizzas', dietary: ['spicy'], popular: true, hue: 8, ingredients: ['Pepperoni', 'Smoked mozzarella', 'Calabrian honey', 'Oregano'] },
  { id: 'funghi', name: 'Funghi e Taleggio', description: 'Roasted maitake and cremini, taleggio, thyme, truffle oil, parmesan snow.', price: 18, category: 'Pizzas', dietary: ['vegetarian'], hue: 32, ingredients: ['Maitake', 'Cremini', 'Taleggio', 'Thyme', 'Truffle oil'] },
  { id: 'verde', name: 'Pizza Verde', description: 'Basil pesto, zucchini ribbons, stracciatella, lemon zest, pistachio crunch. Bright and green.', price: 16, category: 'Pizzas', dietary: ['vegetarian'], hue: 110, ingredients: ['Basil pesto', 'Zucchini', 'Stracciatella', 'Lemon', 'Pistachio'] },
  { id: 'diavola', name: 'Diavola', description: 'Spicy soppressata, Calabrian chili, mozzarella, wildflower honey, basil.', price: 18, category: 'Pizzas', dietary: ['spicy'], popular: true, hue: 4, ingredients: ['Soppressata', 'Calabrian chili', 'Mozzarella', 'Honey'] },
  { id: 'marinara', name: 'Marinara (Vegan)', description: 'Tomato, sliced garlic, oregano, olive oil. No cheese, all confidence — a Neapolitan original.', price: 12, category: 'Pizzas', dietary: ['vegan', 'vegetarian'], hue: 16, ingredients: ['Tomato', 'Garlic', 'Oregano', 'Olive oil'] },
  { id: 'burrata', name: 'Burrata & Prosciutto', description: 'Creamy Puglian burrata, prosciutto di Parma, grilled sourdough, basil oil, flaked salt.', price: 13, category: 'Small Plates', dietary: [], hue: 24, ingredients: ['Burrata', 'Prosciutto', 'Sourdough', 'Basil oil'] },
  { id: 'arancini', name: 'Ember Arancini', description: 'Crisp saffron risotto, smoked mozzarella heart, romesco, parsley. Three to an order.', price: 11, category: 'Small Plates', dietary: ['vegetarian'], hue: 38, ingredients: ['Saffron risotto', 'Smoked mozzarella', 'Romesco'] },
  { id: 'meatballs', name: 'Sunday Meatballs', description: 'Beef and pork meatballs simmered in Sunday sauce, whipped ricotta, grilled bread.', price: 12, category: 'Small Plates', dietary: [], hue: 20, ingredients: ['Beef', 'Pork', 'Sunday sauce', 'Ricotta'] },
  { id: 'caesar', name: 'Little Gem Caesar', description: 'Little gem lettuce, white anchovy dressing, sourdough crisp, aged parmesan.', price: 11, category: 'Salads', dietary: [], hue: 95, ingredients: ['Little gem', 'Anchovy dressing', 'Parmesan'] },
  { id: 'chopped', name: 'Chopped Verde Salad', description: 'Cucumber, avocado, snap peas, herbs, green goddess dressing. Vegan on request.', price: 12, category: 'Salads', dietary: ['vegetarian', 'gluten-free'], hue: 120, ingredients: ['Cucumber', 'Avocado', 'Snap peas', 'Herbs'] },
  { id: 'rigatoni', name: 'Rigatoni alla Vodka', description: 'Tube pasta, tomato-vodka cream, Calabrian chili, basil, pecorino. Comfort, dialed up.', price: 17, category: 'Pastas', dietary: ['vegetarian', 'spicy'], hue: 14, ingredients: ['Rigatoni', 'Vodka sauce', 'Chili', 'Pecorino'] },
  { id: 'cacio', name: 'Cacio e Pepe', description: 'Tonarelli, cracked black pepper, pecorino romano. Three ingredients, zero shortcuts.', price: 15, category: 'Pastas', dietary: ['vegetarian'], hue: 42, ingredients: ['Tonarelli', 'Black pepper', 'Pecorino'] },
  { id: 'tiramisu', name: 'Espresso Tiramisu', description: 'Espresso-soaked ladyfingers, mascarpone cloud, cocoa dust. Made every morning.', price: 9, category: 'Desserts', dietary: ['vegetarian'], hue: 28, ingredients: ['Espresso', 'Mascarpone', 'Cocoa'] },
  { id: 'olive-oil-cake', name: 'Olive Oil Cake', description: 'Citrus olive oil cake, mascarpone, candied fennel. Naturally gluten-free flour blend.', price: 8, category: 'Desserts', dietary: ['vegetarian', 'gluten-free'], hue: 48, ingredients: ['Olive oil', 'Citrus', 'Mascarpone'] },
  { id: 'spritz', name: 'Blood Orange Spritz', description: 'Blood orange, prosecco, soda, rosemary smoke. Zero-proof version available.', price: 9, category: 'Drinks', dietary: ['vegan', 'gluten-free'], hue: 18, ingredients: ['Blood orange', 'Prosecco', 'Rosemary'] },
  { id: 'lemonade', name: 'Basil Lemonade', description: 'House lemonade shaken with basil and a pinch of sea salt. Endlessly refillable in-house.', price: 5, category: 'Drinks', dietary: ['vegan', 'gluten-free'], hue: 80, ingredients: ['Lemon', 'Basil', 'Sea salt'] },
]

export const SIZES = [
  { id: 'small', label: '10″ Personal', delta: -2 },
  { id: 'medium', label: '12″ Classic', delta: 0 },
  { id: 'large', label: '16″ To Share', delta: 5 },
] as const
export type SizeId = (typeof SIZES)[number]['id']

export const TOPPINGS = [
  { id: 'extra-mozz', label: 'Extra mozzarella', price: 2 },
  { id: 'pepperoni', label: 'Pepperoni', price: 3 },
  { id: 'burrata', label: 'Burrata dollop', price: 4 },
  { id: 'mushrooms', label: 'Roasted mushrooms', price: 2.5 },
  { id: 'red-onion', label: 'Red onion', price: 1 },
  { id: 'jalapeno', label: 'Pickled jalapeño', price: 1 },
  { id: 'basil', label: 'Extra basil', price: 1 },
  { id: 'hot-honey', label: 'Hot honey drizzle', price: 1.5 },
] as const
export type ToppingId = (typeof TOPPINGS)[number]['id']

export function getItem(id: string) {
  return MENU.find((m) => m.id === id)
}
