// Second batch of places: lesser-known regional cities and remote towns to make the game harder.
// Run once: node scripts/add-places-2.js   (skips names that already exist)
import { readFileSync, writeFileSync } from 'node:fs';

const K = 1e3, M = 1e6;
// [name, country, lat, lon, population, difficulty]
const NEW = [
  // ---- tier 2: secondary cities most people have heard of ----
  ['Porto', 'Portugal', 41.1579, -8.6291, 230 * K, 2], ['Seville', 'Spain', 37.3891, -5.9845, 690 * K, 2],
  ['Lyon', 'France', 45.764, 4.8357, 520 * K, 2], ['Hamburg', 'Germany', 53.5511, 9.9937, 1.9 * M, 2],
  ['Krakow', 'Poland', 50.0647, 19.945, 780 * K, 2], ['Alexandria', 'Egypt', 31.2001, 29.9187, 5.2 * M, 2],
  ['Monterrey', 'Mexico', 25.6866, -100.3161, 1.1 * M, 2], ['Guadalajara', 'Mexico', 20.6597, -103.3496, 1.5 * M, 2],
  ['Medellín', 'Colombia', 6.2476, -75.5658, 2.5 * M, 2], ['Calgary', 'Canada', 51.0447, -114.0719, 1.3 * M, 2],
  ['Austin', 'USA', 30.2672, -97.7431, 980 * K, 2], ['Portland', 'USA', 45.5152, -122.6784, 650 * K, 2],
  ['Adelaide', 'Australia', -34.9285, 138.6007, 1.4 * M, 2], ['Busan', 'South Korea', 35.1796, 129.0756, 3.4 * M, 2],
  ['Guangzhou', 'China', 23.1291, 113.2644, 18 * M, 2], ['Shenzhen', 'China', 22.5431, 114.0579, 17.5 * M, 2],
  ['Chennai', 'India', 13.0827, 80.2707, 7.1 * M, 2], ['Hyderabad', 'India', 17.385, 78.4867, 10 * M, 2],
  ['Lahore', 'Pakistan', 31.5204, 74.3587, 13 * M, 2], ['Jeddah', 'Saudi Arabia', 21.4858, 39.1925, 4.7 * M, 2],
  ['Amman', 'Jordan', 31.9454, 35.9284, 4 * M, 2], ['Nashville', 'USA', 36.1627, -86.7816, 690 * K, 2],
  // ---- tier 3: capitals and big cities people vaguely know ----
  ['Belgrade', 'Serbia', 44.7866, 20.4489, 1.4 * M, 3], ['Bucharest', 'Romania', 44.4268, 26.1025, 1.8 * M, 3],
  ['Sofia', 'Bulgaria', 42.6977, 23.3219, 1.2 * M, 3], ['Zagreb', 'Croatia', 45.815, 15.9819, 770 * K, 3],
  ['Riga', 'Latvia', 56.9496, 24.1052, 610 * K, 3], ['Vilnius', 'Lithuania', 54.6872, 25.2797, 590 * K, 3],
  ['Minsk', 'Belarus', 53.9006, 27.559, 2 * M, 3], ['Odesa', 'Ukraine', 46.4825, 30.7233, 1 * M, 3],
  ['Izmir', 'Turkey', 38.4237, 27.1428, 4.3 * M, 3], ['Khartoum', 'Sudan', 15.5007, 32.5599, 5.8 * M, 3],
  ['Kampala', 'Uganda', 0.3476, 32.5825, 1.7 * M, 3], ['Dar es Salaam', 'Tanzania', -6.7924, 39.2083, 5.4 * M, 3],
  ['Lusaka', 'Zambia', -15.3875, 28.3228, 2.7 * M, 3], ['Maputo', 'Mozambique', -25.9692, 32.5732, 1.1 * M, 3],
  ['Abuja', 'Nigeria', 9.0765, 7.3986, 3.6 * M, 3], ['Abidjan', 'Ivory Coast', 5.36, -4.0083, 5.6 * M, 3],
  ['Montevideo', 'Uruguay', -34.9011, -56.1645, 1.3 * M, 3], ['Salvador', 'Brazil', -12.9777, -38.5016, 2.9 * M, 3],
  ['Recife', 'Brazil', -8.0476, -34.877, 1.6 * M, 3], ['Halifax', 'Canada', 44.6488, -63.5752, 440 * K, 3],
  ['Salt Lake City', 'USA', 40.7608, -111.891, 200 * K, 3], ['Christchurch', 'New Zealand', -43.5321, 172.6362, 380 * K, 3],
  ['Fukuoka', 'Japan', 33.5904, 130.4017, 1.6 * M, 3], ['Hiroshima', 'Japan', 34.3853, 132.4553, 1.2 * M, 3],
  ['Surabaya', 'Indonesia', -7.2575, 112.7521, 2.9 * M, 3], ['Cebu', 'Philippines', 10.3157, 123.8854, 960 * K, 3],
  ['Chiang Mai', 'Thailand', 18.7883, 98.9853, 130 * K, 3], ['Da Nang', 'Vietnam', 16.0544, 108.2022, 1.2 * M, 3],
  ['Jaipur', 'India', 26.9124, 75.7873, 3.1 * M, 3], ['Islamabad', 'Pakistan', 33.6844, 73.0479, 1.1 * M, 3],
  ['Muscat', 'Oman', 23.588, 58.3829, 1.4 * M, 3], ['Kuwait City', 'Kuwait', 29.3759, 47.9774, 3 * M, 3],
  ['Damascus', 'Syria', 33.5138, 36.2765, 2.5 * M, 3], ["Xi'an", 'China', 34.3416, 108.9398, 12.9 * M, 3],
  ['Harbin', 'China', 45.8038, 126.535, 10 * M, 3], ['Qingdao', 'China', 36.0671, 120.3826, 10 * M, 3],
  ['Palermo', 'Italy', 38.1157, 13.3615, 650 * K, 3], ['Toulouse', 'France', 43.6047, 1.4442, 500 * K, 3],
  ['Gothenburg', 'Sweden', 57.7089, 11.9746, 580 * K, 3], ['Dresden', 'Germany', 51.0504, 13.7373, 560 * K, 3],
  ['Bilbao', 'Spain', 43.263, -2.935, 350 * K, 3], ['Cork', 'Ireland', 51.8985, -8.4756, 220 * K, 3],
  ['Durban', 'South Africa', -29.8587, 31.0218, 3.7 * M, 3], ['Mombasa', 'Kenya', -4.0435, 39.6682, 1.2 * M, 3],
  ['Tijuana', 'Mexico', 32.5149, -117.0382, 1.9 * M, 3], ['Kingston', 'Jamaica', 17.9712, -76.7936, 590 * K, 3],
  ['Santo Domingo', 'Dominican Republic', 18.4861, -69.9312, 1 * M, 3], ['San Juan', 'Puerto Rico', 18.4655, -66.1057, 340 * K, 3],
  ['Guayaquil', 'Ecuador', -2.17, -79.9224, 2.7 * M, 3], ['Cusco', 'Peru', -13.5319, -71.9675, 430 * K, 3],
  ['Córdoba', 'Argentina', -31.4201, -64.1888, 1.4 * M, 3], ['Porto Alegre', 'Brazil', -30.0346, -51.2177, 1.5 * M, 3],
  ['Astana', 'Kazakhstan', 51.1605, 71.4704, 1.4 * M, 3], ['Kaohsiung', 'Taiwan', 22.6273, 120.3014, 2.7 * M, 3],
  // ---- tier 4: you need real geography ----
  ['Tartu', 'Estonia', 58.3776, 26.729, 97 * K, 4], ['Bergen', 'Norway', 60.3913, 5.3221, 290 * K, 4],
  ['Aberdeen', 'UK', 57.1497, -2.0943, 200 * K, 4], ['Gdańsk', 'Poland', 54.352, 18.6466, 470 * K, 4],
  ['Brno', 'Czechia', 49.1951, 16.6068, 380 * K, 4], ['Ljubljana', 'Slovenia', 46.0569, 14.5058, 290 * K, 4],
  ['Sarajevo', 'Bosnia and Herzegovina', 43.8563, 18.4131, 280 * K, 4], ['Skopje', 'North Macedonia', 41.9981, 21.4254, 540 * K, 4],
  ['Tirana', 'Albania', 41.3275, 19.8187, 560 * K, 4], ['Chișinău', 'Moldova', 47.0105, 28.8638, 530 * K, 4],
  ['Kharkiv', 'Ukraine', 49.9935, 36.2304, 1.4 * M, 4], ['Kazan', 'Russia', 55.8304, 49.0661, 1.3 * M, 4],
  ['Murmansk', 'Russia', 68.9585, 33.0827, 280 * K, 4], ['Irkutsk', 'Russia', 52.2869, 104.305, 620 * K, 4],
  ['Dushanbe', 'Tajikistan', 38.5598, 68.787, 1.2 * M, 4], ['Ashgabat', 'Turkmenistan', 37.9601, 58.3261, 1 * M, 4],
  ['Herat', 'Afghanistan', 34.3482, 62.1997, 570 * K, 4], ['Quetta', 'Pakistan', 30.1798, 66.975, 1 * M, 4],
  ['Mandalay', 'Myanmar', 21.9588, 96.0891, 1.2 * M, 4], ['Vientiane', 'Laos', 17.9757, 102.6331, 950 * K, 4],
  ['Kota Kinabalu', 'Malaysia', 5.9804, 116.0735, 500 * K, 4], ['Davao', 'Philippines', 7.1907, 125.4553, 1.8 * M, 4],
  ['Makassar', 'Indonesia', -5.1477, 119.4327, 1.4 * M, 4], ['Townsville', 'Australia', -19.2576, 146.8178, 180 * K, 4],
  ['Dunedin', 'New Zealand', -45.8788, 170.5028, 130 * K, 4], ['Nouméa', 'New Caledonia', -22.2758, 166.458, 100 * K, 4],
  ['Fairbanks', 'USA', 64.8378, -147.7164, 32 * K, 4], ['Whitehorse', 'Canada', 60.7212, -135.0568, 28 * K, 4],
  ["St. John's", 'Canada', 47.5615, -52.7126, 110 * K, 4], ['Boise', 'USA', 43.615, -116.2023, 235 * K, 4],
  ['Omaha', 'USA', 41.2565, -95.9345, 490 * K, 4], ['Mérida', 'Mexico', 20.9674, -89.5926, 920 * K, 4],
  ['San José', 'Costa Rica', 9.9281, -84.0907, 340 * K, 4], ['Managua', 'Nicaragua', 12.115, -86.2362, 1 * M, 4],
  ['Port-au-Prince', 'Haiti', 18.5944, -72.3074, 990 * K, 4], ['Cartagena', 'Colombia', 10.391, -75.4794, 900 * K, 4],
  ['Arequipa', 'Peru', -16.409, -71.5375, 1 * M, 4], ['Cochabamba', 'Bolivia', -17.3895, -66.1568, 630 * K, 4],
  ['Mendoza', 'Argentina', -32.8895, -68.8458, 115 * K, 4], ['Valparaíso', 'Chile', -33.0472, -71.6127, 300 * K, 4],
  ['Belém', 'Brazil', -1.4558, -48.4902, 1.5 * M, 4], ['Fortaleza', 'Brazil', -3.7319, -38.5267, 2.7 * M, 4],
  ['Asunción', 'Paraguay', -25.2637, -57.5759, 520 * K, 4], ['Windhoek', 'Namibia', -22.5609, 17.0658, 430 * K, 4],
  ['Bamako', 'Mali', 12.6392, -8.0029, 2.7 * M, 4], ['Ouagadougou', 'Burkina Faso', 12.3714, -1.5197, 2.4 * M, 4],
  ['Kigali', 'Rwanda', -1.9441, 30.0619, 1.2 * M, 4], ['Harare', 'Zimbabwe', -17.8252, 31.0335, 1.5 * M, 4],
  ['Gaborone', 'Botswana', -24.6282, 25.9231, 250 * K, 4], ['Djibouti', 'Djibouti', 11.5721, 43.1456, 600 * K, 4],
  ['Mogadishu', 'Somalia', 2.0469, 45.3182, 2.6 * M, 4], ["Sana'a", 'Yemen', 15.3694, 44.191, 3 * M, 4],
  ['Basra', 'Iraq', 30.5085, 47.7804, 1.3 * M, 4], ['Erbil', 'Iraq', 36.1911, 44.0092, 1.5 * M, 4],
  ['Tabriz', 'Iran', 38.0962, 46.2738, 1.6 * M, 4], ['Shiraz', 'Iran', 29.5918, 52.5837, 1.9 * M, 4],
  ['Gaziantep', 'Turkey', 37.0662, 37.3833, 2.1 * M, 4], ['Trabzon', 'Turkey', 41.0015, 39.7178, 800 * K, 4],
  ['Nicosia', 'Cyprus', 35.1856, 33.3823, 250 * K, 4], ['Valletta', 'Malta', 35.8989, 14.5146, 6 * K, 4],
  ['Cagliari', 'Italy', 39.2238, 9.1217, 150 * K, 4], ['Innsbruck', 'Austria', 47.2692, 11.4041, 130 * K, 4],
  ['Leipzig', 'Germany', 51.3397, 12.3731, 600 * K, 4], ['Malmö', 'Sweden', 55.605, 13.0038, 350 * K, 4],
  ['Aarhus', 'Denmark', 56.1629, 10.2039, 290 * K, 4], ['Tampere', 'Finland', 61.4978, 23.761, 250 * K, 4],
  ['Trondheim', 'Norway', 63.4305, 10.3951, 210 * K, 4], ['Lanzhou', 'China', 36.0611, 103.8343, 4.4 * M, 4],
  ['Nanning', 'China', 22.817, 108.3665, 8.8 * M, 4], ['Dalian', 'China', 38.914, 121.6147, 7.4 * M, 4],
  ['Nagasaki', 'Japan', 32.7503, 129.8777, 400 * K, 4], ['Sendai', 'Japan', 38.2682, 140.8694, 1.1 * M, 4],
  ['Daegu', 'South Korea', 35.8714, 128.6014, 2.4 * M, 4], ['Jeju', 'South Korea', 33.4996, 126.5312, 490 * K, 4],
  ['Hue', 'Vietnam', 16.4637, 107.5909, 650 * K, 4], ['Siem Reap', 'Cambodia', 13.3671, 103.8448, 250 * K, 4],
  ['Kandy', 'Sri Lanka', 7.2906, 80.6337, 125 * K, 4], ['Batumi', 'Georgia', 41.6168, 41.6367, 170 * K, 4],
  // ---- tier 5: remote, obscure, or tiny ----
  ['Rovaniemi', 'Finland', 66.5039, 25.7294, 65 * K, 5], ['Tórshavn', 'Faroe Islands', 62.0107, -6.7741, 14 * K, 5],
  ['Akureyri', 'Iceland', 65.6835, -18.1262, 19 * K, 5], ['Ulan-Ude', 'Russia', 51.8336, 107.5847, 440 * K, 5],
  ['Magadan', 'Russia', 59.561, 150.8301, 92 * K, 5], ['Petropavlovsk-Kamchatsky', 'Russia', 53.037, 158.6559, 180 * K, 5],
  ['Anadyr', 'Russia', 64.7337, 177.4968, 15 * K, 5], ['Norilsk', 'Russia', 69.3535, 88.2027, 180 * K, 5],
  ['Kashgar', 'China', 39.4704, 75.9898, 1 * M, 5], ['Hohhot', 'China', 40.8426, 111.749, 3.4 * M, 5],
  ['Luang Prabang', 'Laos', 19.8856, 102.1347, 56 * K, 5], ['Dili', 'Timor-Leste', -8.5569, 125.5603, 280 * K, 5],
  ['Honiara', 'Solomon Islands', -9.4456, 159.9729, 95 * K, 5], ['Port Vila', 'Vanuatu', -17.7333, 168.3273, 50 * K, 5],
  ["Nuku'alofa", 'Tonga', -21.1393, -175.2049, 23 * K, 5], ['Apia', 'Samoa', -13.8506, -171.7513, 37 * K, 5],
  ['Majuro', 'Marshall Islands', 7.1164, 171.1858, 28 * K, 5], ['Koror', 'Palau', 7.3419, 134.4792, 11 * K, 5],
  ['Saipan', 'Northern Mariana Islands', 15.1894, 145.7466, 48 * K, 5], ['Rarotonga', 'Cook Islands', -21.2367, -159.7777, 13 * K, 5],
  ['Hilo', 'USA', 19.7297, -155.09, 45 * K, 5], ['Yellowknife', 'Canada', 62.454, -114.3718, 20 * K, 5],
  ['Iqaluit', 'Canada', 63.7467, -68.517, 7.7 * K, 5], ['Churchill', 'Canada', 58.7684, -94.165, 870, 5],
  ['Utqiaġvik', 'USA', 71.2906, -156.7886, 4.4 * K, 5], ['Kodiak', 'USA', 57.79, -152.4072, 6 * K, 5],
  ['Unalaska', 'USA', 53.8731, -166.5372, 4.5 * K, 5], ['Ittoqqortoormiit', 'Greenland', 70.4853, -21.9622, 350, 5],
  ['Punta Arenas', 'Chile', -53.1638, -70.9171, 130 * K, 5], ['Georgetown', 'Guyana', 6.8013, -58.1551, 120 * K, 5],
  ['Paramaribo', 'Suriname', 5.852, -55.2038, 240 * K, 5], ['Cayenne', 'French Guiana', 4.9224, -52.3135, 65 * K, 5],
  ['Niamey', 'Niger', 13.5116, 2.1254, 1.3 * M, 5], ["N'Djamena", 'Chad', 12.1348, 15.0557, 1.4 * M, 5],
  ['Freetown', 'Sierra Leone', 8.4657, -13.2317, 1.2 * M, 5], ['Monrovia', 'Liberia', 6.3005, -10.7969, 1.5 * M, 5],
  ['Libreville', 'Gabon', 0.4162, 9.4673, 800 * K, 5], ['Brazzaville', 'Republic of the Congo', -4.2634, 15.2429, 2.4 * M, 5],
  ['Lilongwe', 'Malawi', -13.9626, 33.7741, 1 * M, 5], ['Bulawayo', 'Zimbabwe', -20.1325, 28.6265, 650 * K, 5],
  ['Asmara', 'Eritrea', 15.3229, 38.9251, 960 * K, 5], ['Hargeisa', 'Somalia', 9.56, 44.065, 1.2 * M, 5],
  ['Aden', 'Yemen', 12.7855, 45.0187, 1 * M, 5], ['Ajaccio', 'France', 41.9192, 8.7386, 70 * K, 5],
];

const places = JSON.parse(readFileSync('data/places.json', 'utf8'));
const have = new Set(places.map((p) => p.name));
let added = 0;
for (const [name, country, lat, lon, population, difficulty] of NEW) {
  if (have.has(name)) continue;
  places.push({ name, country, lat, lon, difficulty, ...(population ? { population } : {}) });
  added++;
}
writeFileSync('data/places.json', '[\n' + places.map((x) => JSON.stringify(x)).join(',\n') + '\n]\n');
const counts = {};
for (const p of places) counts[p.difficulty] = (counts[p.difficulty] || 0) + 1;
console.log(`added ${added}; total ${places.length}; per tier`, counts);
