// ~30 products across DataCo categories. Prices are the DataCo list price (USD).
export interface MockProduct {
  id: number;
  name: string;
  category: string;
  price: number;
}

export const products: MockProduct[] = [
  { id: 41, name: "Perfect Fitness Perfect Rip Deck", category: "Cardio Equipment", price: 59.99 },
  { id: 42, name: "Diamondback Women's Serene Classic Comfort Bike", category: "Cardio Equipment", price: 299.98 },
  { id: 43, name: "Bowflex SelectTech 552 Dumbbells", category: "Cardio Equipment", price: 349.0 },
  { id: 44, name: "Garmin Forerunner 220 GPS Watch", category: "Cardio Equipment", price: 199.99 },
  { id: 51, name: "Nike Men's Vapor Carbon Elite TD Cleat", category: "Cleats", price: 129.99 },
  { id: 52, name: "Under Armour Men's Highlight MC Football Cleat", category: "Cleats", price: 129.99 },
  { id: 53, name: "adidas Men's F10 Messi TRX FG Soccer Cleat", category: "Cleats", price: 59.99 },
  { id: 61, name: "Nike Men's Free 5.0+ Running Shoe", category: "Men's Footwear", price: 99.99 },
  { id: 62, name: "Nike Men's CJ Elite 2 TD Football Cleat", category: "Men's Footwear", price: 129.99 },
  { id: 63, name: "Merrell Men's All Out Flash Trail Running Shoe", category: "Men's Footwear", price: 109.99 },
  { id: 71, name: "Field & Stream Sportsman 16 Gun Fire Safe", category: "Camping & Hiking", price: 399.98 },
  { id: 72, name: "Coleman 6-Person Instant Tent", category: "Camping & Hiking", price: 179.99 },
  { id: 73, name: "Teton Sports Scout 3400 Backpack", category: "Camping & Hiking", price: 69.99 },
  { id: 74, name: "Stanley Classic Vacuum Bottle", category: "Camping & Hiking", price: 34.99 },
  { id: 81, name: "Pelican Sunstream 100 Kayak", category: "Water Sports", price: 199.99 },
  { id: 82, name: "O'Brien Men's Neoprene Life Vest", category: "Water Sports", price: 49.98 },
  { id: 83, name: "Speedo Vanquisher 2.0 Mirrored Goggles", category: "Water Sports", price: 19.99 },
  { id: 91, name: "Nike Men's Dri-FIT Victory Golf Polo", category: "Men's Golf Clubs", price: 50.0 },
  { id: 92, name: "TaylorMade SLDR Irons", category: "Men's Golf Clubs", price: 899.99 },
  { id: 93, name: "Callaway X Hot Driver", category: "Men's Golf Clubs", price: 299.99 },
  { id: 101, name: "Under Armour Girls' Toddler Spine Surge Runni", category: "Girls' Apparel", price: 39.99 },
  { id: 102, name: "Nike Girls' Pro Cool Compression Shorts", category: "Girls' Apparel", price: 24.99 },
  { id: 111, name: "Team Golf Texas Longhorns Putter Grip", category: "Accessories", price: 24.99 },
  { id: 112, name: "Hydro Flask 32 oz Wide Mouth", category: "Accessories", price: 39.95 },
  { id: 113, name: "Polar FT4 Heart Rate Monitor", category: "Accessories", price: 79.99 },
  { id: 121, name: "Glove It Women's Mod Oval 3-Zip Carry All Bag", category: "Shop By Sport", price: 21.99 },
  { id: 122, name: "Wilson Evolution Indoor Basketball", category: "Shop By Sport", price: 59.99 },
  { id: 123, name: "Spalding NBA Street Basketball", category: "Shop By Sport", price: 24.99 },
  { id: 131, name: "Columbia Men's PFG Bahama II Shirt", category: "Fishing", price: 44.99 },
  { id: 132, name: "Shakespeare Ugly Stik GX2 Spinning Combo", category: "Fishing", price: 49.99 },
];

export const productById = (id: number) => products.find((p) => p.id === id);
export const categories = [...new Set(products.map((p) => p.category))];
