import { PrismaClient } from "../app/generated/prisma";
import Pokedex from "pokedex-promise-v2";

const prisma = new PrismaClient();
const pokedex = new Pokedex();

const POKEMON_COUNT = 151; // 取得するポケモンの数 (初代)

async function main() {
  console.log("Seeding database with Pokemon data...");

  const existingPokemons = await prisma.pokemon.findMany({
    select: { id: true },
  });
  const existingIds = new Set(existingPokemons.map((p: { id: number }) => p.id));

  const pokemonPromises = [];
  for (let i = 1; i <= POKEMON_COUNT; i++) {
    if (!existingIds.has(i)) {
      pokemonPromises.push(getPokemonData(i));
    }
  }

  const newPokemonData = (await Promise.all(pokemonPromises)).filter(
    (p): p is NonNullable<Awaited<ReturnType<typeof getPokemonData>>> => p !== null
  );

  if (newPokemonData.length > 0) {
    console.log(`Adding ${newPokemonData.length} new Pokemon to the database...`);
    try {
      const result = await prisma.pokemon.createMany({
        data: newPokemonData,
      });
      console.log(`Added ${result.count} Pokemon.`);
    } catch (error) {
      console.error("Error adding Pokemon to database:", error);
    }
  } else {
    console.log("No new Pokemon to add.");
  }

  console.log("Seeding finished.");
}

async function getPokemonData(id: number) {
  try {
    console.log(`Fetching data for Pokemon ID: ${id}...`);
    const pokemon = await pokedex.getPokemonByName(id.toString());
    const species = await pokedex.getPokemonSpeciesByName(id.toString());

    const nameJaEntry = species.names.find((name) => name.language.name === "ja-Hrkt");
    const nameJa = nameJaEntry ? nameJaEntry.name : null;

    // タイプ名 (英語)
    const types = pokemon.types.map((typeInfo) => typeInfo.type.name);
    // タイプ名 (日本語)
    const typesJaPromises = pokemon.types.map(async (typeInfo) => {
      try {
        const typeData = await pokedex.getTypeByName(typeInfo.type.name);
        const jaNameEntry = typeData.names.find(n => n.language.name === 'ja-Hrkt' || n.language.name === 'ja');
        return jaNameEntry ? jaNameEntry.name : typeInfo.type.name; // 日本語名なければ英語名
      } catch (err) {
        console.error(`Error fetching Japanese name for type ${typeInfo.type.name}:`, err);
        return typeInfo.type.name; // エラー時も英語名
      }
    });
    const typesJa = await Promise.all(typesJaPromises);

    // 特性名 (英語)
    const abilities = pokemon.abilities.map((abilityInfo) => abilityInfo.ability.name);
    // 特性名 (日本語)
    const abilitiesJaPromises = pokemon.abilities.map(async (abilityInfo) => {
      try {
        const abilityData = await pokedex.getAbilityByName(abilityInfo.ability.name);
        const jaNameEntry = abilityData.names.find(n => n.language.name === 'ja-Hrkt' || n.language.name === 'ja');
        return jaNameEntry ? jaNameEntry.name : abilityInfo.ability.name;
      } catch (err) {
        console.error(`Error fetching Japanese name for ability ${abilityInfo.ability.name}:`, err);
        return abilityInfo.ability.name;
      }
    });
    const abilitiesJa = await Promise.all(abilitiesJaPromises);

    const imageUrl = pokemon.sprites.other?.["official-artwork"]?.front_default ?? pokemon.sprites.front_default;

    const data = {
      id: pokemon.id,
      name: pokemon.name,
      nameJa: nameJa,
      types: types,
      abilities: abilities,
      typesJa: typesJa,
      abilitiesJa: abilitiesJa,
      imageUrl: imageUrl,
      height: pokemon.height,
      weight: pokemon.weight,
    };

    // データ欠損チェック（例：nameJa が必須の場合）
    if (!data.name) {
        console.warn(`Skipping Pokemon ID ${id} due to missing name.`);
        return null;
    }

    console.log(`Successfully fetched data for ${data.name} (${data.nameJa || 'N/A'})`);
    return data;

  } catch (error) {
    console.error(`Failed to fetch data for Pokemon ID: ${id}`, error);
    return null;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
