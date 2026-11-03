// One-off helper: assigns a difficulty (1 easy … 5 extreme) to every place in data/places.json.
// Re-run after adding places; anything not listed below defaults to 3.
import { readFileSync, writeFileSync } from 'node:fs';

const TIERS = {
  1: ['New York City', 'Los Angeles', 'London', 'Paris', 'Tokyo', 'Sydney', 'Rome', 'Cairo', 'Moscow', 'Beijing',
      'Mexico City', 'Rio de Janeiro', 'Toronto', 'Madrid', 'Berlin', 'Dubai', 'Mumbai', 'Hong Kong', 'Honolulu',
      'Chicago', 'Miami', 'Istanbul', 'Cape Town', 'Buenos Aires', 'Singapore'],
  2: ['Seattle', 'Denver', 'Las Vegas', 'New Orleans', 'Vancouver', 'Montreal', 'Havana', 'Lima', 'Santiago',
      'São Paulo', 'Reykjavik', 'Dublin', 'Barcelona', 'Lisbon', 'Venice', 'Amsterdam', 'Vienna', 'Prague',
      'Stockholm', 'Athens', 'Jerusalem', 'New Delhi', 'Bangkok', 'Seoul', 'Shanghai', 'Melbourne', 'Auckland',
      'Nairobi', 'Johannesburg', 'Edinburgh', 'Kyiv', 'Jakarta', 'Manila', 'Bali', 'Grand Canyon', 'Niagara Falls',
      'Mount Everest', 'Mecca', 'Taipei', 'Osaka', 'Anchorage'],
  3: ['Cancún', 'Panama City', 'Bogotá', 'Quito', 'Brasília', 'Caracas', 'Marseille', 'Milan', 'Naples', 'Munich',
      'Brussels', 'Zurich', 'Warsaw', 'Budapest', 'Copenhagen', 'Oslo', 'Helsinki', 'Ankara', 'Saint Petersburg',
      'Marrakesh', 'Casablanca', 'Lagos', 'Addis Ababa', 'Beirut', 'Riyadh', 'Doha', 'Tehran', 'Baghdad', 'Kabul',
      'Karachi', 'Kolkata', 'Kathmandu', 'Dhaka', 'Hanoi', 'Ho Chi Minh City', 'Kuala Lumpur', 'Perth', 'Brisbane',
      'Wellington', 'Machu Picchu', 'Galápagos Islands', 'Easter Island', 'Yellowstone', 'Great Barrier Reef',
      'Petra', 'Angkor Wat', 'Stonehenge', 'Uluru', 'Kilimanjaro', 'Victoria Falls', 'Sapporo', 'Phuket', 'Colombo',
      'Chernobyl', 'Mont Blanc', 'Gibraltar', 'Bermuda', 'Fiji', 'Tahiti'],
  4: ['Manaus', 'La Paz', 'Ushuaia', 'Nuuk', 'Tallinn', 'Tunis', 'Accra', 'Dakar', 'Zanzibar', 'Kinshasa', 'Luanda',
      'Antananarivo', 'Mauritius', 'Bangalore', 'Malé', 'Yangon', 'Phnom Penh', 'Chengdu', 'Lhasa', 'Pyongyang',
      'Okinawa', 'Ulaanbaatar', 'Almaty', 'Tashkent', 'Darwin', 'Hobart', 'Queenstown', 'Vladivostok', 'Sochi',
      'Tbilisi', 'Baku', 'Yerevan', 'Timbuktu', 'Svalbard', 'Azores', 'Canary Islands', 'Falkland Islands'],
  5: ['Novosibirsk', 'Ürümqi', 'Port Moresby', 'Guam', 'McMurdo Station', 'Cape Verde', 'Tamanrasset (Sahara)'],
};

const byName = {};
for (const [d, names] of Object.entries(TIERS)) for (const n of names) byName[n] = Number(d);

const places = JSON.parse(readFileSync('data/places.json', 'utf8'));
const counts = {};
for (const p of places) {
  p.difficulty = byName[p.name] ?? 3;
  counts[p.difficulty] = (counts[p.difficulty] || 0) + 1;
}
writeFileSync('data/places.json', JSON.stringify(places, null, 0).replace(/\},\{/g, '},\n{').replace('[{', '[\n{').replace('}]', '}\n]') + '\n');
console.log('tagged', places.length, 'places; per tier:', counts);
