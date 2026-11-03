// One-off helper: adds an approximate `population` (people) to cities in data/places.json.
// Landmarks and uninhabited places are left without one and the UI omits the line.
import { readFileSync, writeFileSync } from 'node:fs';

const M = 1e6, K = 1e3;
const POP = {
  'New York City': 8.3 * M, 'Los Angeles': 3.9 * M, Chicago: 2.7 * M, Miami: 450 * K, Seattle: 750 * K, Denver: 715 * K,
  Honolulu: 350 * K, Anchorage: 290 * K, 'New Orleans': 380 * K, 'Las Vegas': 650 * K, Toronto: 2.8 * M, Vancouver: 680 * K,
  Montreal: 1.8 * M, 'Mexico City': 9.2 * M, Cancún: 900 * K, Havana: 2.1 * M, 'Panama City': 880 * K, Bogotá: 7.9 * M,
  Lima: 9.7 * M, Quito: 1.9 * M, Santiago: 6.3 * M, 'Buenos Aires': 3.1 * M, Ushuaia: 82 * K, 'Rio de Janeiro': 6.7 * M,
  'São Paulo': 12.3 * M, Brasília: 3.1 * M, Manaus: 2.2 * M, Caracas: 2.9 * M, 'La Paz': 940 * K, Reykjavik: 140 * K,
  Nuuk: 20 * K, London: 8.9 * M, Edinburgh: 530 * K, Dublin: 590 * K, Paris: 2.1 * M, Marseille: 870 * K, Madrid: 3.3 * M,
  Barcelona: 1.6 * M, Lisbon: 550 * K, Rome: 2.8 * M, Venice: 250 * K, Milan: 1.4 * M, Naples: 910 * K, Berlin: 3.7 * M,
  Munich: 1.5 * M, Amsterdam: 920 * K, Brussels: 190 * K, Zurich: 430 * K, Vienna: 1.9 * M, Prague: 1.3 * M, Warsaw: 1.8 * M,
  Budapest: 1.7 * M, Copenhagen: 650 * K, Stockholm: 980 * K, Oslo: 710 * K, Helsinki: 670 * K, Tallinn: 450 * K,
  Athens: 640 * K, Istanbul: 15.5 * M, Ankara: 5.7 * M, Kyiv: 2.9 * M, Moscow: 12.6 * M, 'Saint Petersburg': 5.4 * M,
  Vladivostok: 600 * K, Novosibirsk: 1.6 * M, Cairo: 10 * M, Marrakesh: 930 * K, Casablanca: 3.4 * M, Tunis: 640 * K,
  Lagos: 15 * M, Accra: 2.5 * M, Dakar: 1.2 * M, 'Addis Ababa': 3.8 * M, Nairobi: 4.4 * M, Zanzibar: 220 * K,
  Kinshasa: 15 * M, Luanda: 2.6 * M, Johannesburg: 5.6 * M, 'Cape Town': 4.7 * M, Antananarivo: 1.4 * M, Mauritius: 1.3 * M,
  Jerusalem: 950 * K, Beirut: 360 * K, Riyadh: 7.6 * M, Mecca: 2 * M, Dubai: 3.5 * M, Doha: 1 * M, Tehran: 9 * M,
  Baghdad: 7.5 * M, Kabul: 4.6 * M, Karachi: 16 * M, Mumbai: 12.5 * M, 'New Delhi': 16.8 * M, Kolkata: 4.5 * M,
  Bangalore: 8.4 * M, Kathmandu: 1 * M, Dhaka: 8.9 * M, Colombo: 750 * K, Malé: 210 * K, Yangon: 5.2 * M, Bangkok: 8.3 * M,
  Phuket: 420 * K, Hanoi: 8 * M, 'Ho Chi Minh City': 9 * M, 'Phnom Penh': 2.3 * M, 'Kuala Lumpur': 1.8 * M,
  Singapore: 5.6 * M, Jakarta: 10.6 * M, Bali: 4.3 * M, Manila: 1.8 * M, 'Hong Kong': 7.5 * M, Shanghai: 24.9 * M,
  Beijing: 21.5 * M, Chengdu: 16.3 * M, Lhasa: 560 * K, Ürümqi: 3.5 * M, Taipei: 2.6 * M, Seoul: 9.7 * M,
  Pyongyang: 3.2 * M, Tokyo: 13.9 * M, Osaka: 2.8 * M, Sapporo: 2 * M, Okinawa: 1.5 * M, Ulaanbaatar: 1.6 * M,
  Almaty: 2 * M, Tashkent: 2.6 * M, Perth: 2.1 * M, Sydney: 5.3 * M, Melbourne: 5.1 * M, Brisbane: 2.5 * M,
  Darwin: 150 * K, Hobart: 250 * K, Auckland: 1.7 * M, Wellington: 215 * K, Queenstown: 16 * K, 'Port Moresby': 400 * K,
  Fiji: 900 * K, Tahiti: 190 * K, Guam: 170 * K, 'McMurdo Station': 1 * K, Svalbard: 2.6 * K, Bermuda: 64 * K,
  Azores: 240 * K, 'Canary Islands': 2.2 * M, 'Cape Verde': 560 * K, 'Falkland Islands': 3.7 * K, Timbuktu: 35 * K,
  'Tamanrasset (Sahara)': 110 * K, Gibraltar: 34 * K, Sochi: 430 * K, Tbilisi: 1.2 * M, Baku: 2.3 * M, Yerevan: 1.1 * M,
  'Tristan da Cunha': 240, 'Pitcairn Island': 50, 'Kerguelen Islands': 80, 'Diego Garcia': 3 * K, Yakutsk: 350 * K,
  Nome: 3.7 * K, Socotra: 60 * K, Tromsø: 77 * K, 'Thule (Pituffik)': 150, 'Alice Springs': 26 * K, Nouakchott: 1.3 * M,
  Bishkek: 1.1 * M, Thimphu: 115 * K, 'Ascension Island': 800, 'Galápagos Islands': 33 * K, 'Easter Island': 7.7 * K,
  'Machu Picchu': 0, 'Mount Everest': 0, Kilimanjaro: 0, 'Victoria Falls': 0, 'Grand Canyon': 0, Yellowstone: 0,
  'Niagara Falls': 0, 'Great Barrier Reef': 0, Petra: 0, 'Angkor Wat': 0, Chernobyl: 0, Stonehenge: 0, 'Mont Blanc': 0, Uluru: 0,
};

const places = JSON.parse(readFileSync('data/places.json', 'utf8'));
let n = 0, missing = [];
for (const p of places) {
  const v = POP[p.name];
  if (v === undefined) { missing.push(p.name); continue; }
  if (v > 0) { p.population = Math.round(v); n++; } else delete p.population;
}
writeFileSync('data/places.json', '[\n' + places.map((x) => JSON.stringify(x)).join(',\n') + '\n]\n');
console.log('population set for', n, 'places; missing:', missing);
