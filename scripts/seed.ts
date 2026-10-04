// A small, explicitly curated initial release. Full-book processing is tracked separately.
import { join } from "node:path";
import {
  DatasetSchema,
  type Character,
  type Dataset,
  type Evidence,
  type Relationship,
} from "../src/data/schema";
import {
  readJSON,
  writeJSON,
  datasetPath,
  corpusPath,
  exists,
  digest,
  normalize,
  locateExcerpt,
  sectionAt,
  type Corpus,
} from "./io";
const epic = "mahabharata";
const corpus = await readJSON<Corpus>(join(corpusPath(epic), "source.json"));
if (await exists(datasetPath(epic))) {
  const existing = await readJSON<Dataset>(datasetPath(epic));
  if (existing.coverage.processedBatchIds.length)
    throw new Error("Starter generation cannot overwrite extraction progress.");
}
const evidence: Evidence[] = [];
const characters: Character[] = [];
const relationships: Relationship[] = [];
function ev(pageNumber: number, excerpt: string) {
  const page = corpus.pages[pageNumber - 1];
  const location = locateExcerpt(page.text, excerpt);
  const id = `${epic}:e:${digest(`${corpus.sourceHash}:${pageNumber}:${location.start}:${location.end}`).slice(0, 20)}`;
  if (!evidence.some((e) => e.id === id))
    evidence.push({
      id,
      sourceId: corpus.sourceId,
      page: pageNumber,
      book: page.book,
      parva: page.parva,
      section: sectionAt(page, location.start),
      excerpt: normalize(excerpt),
      ...location,
    });
  return id;
}
function c(
  key: string,
  name: string,
  refs: string[],
  description: string,
  gender: string | null = null,
  kind: Character["kind"] = "human",
  aliases: { label: string; evidenceIds: string[] }[] = [],
) {
  const id = `${epic}:seed:${key}`;
  characters.push({
    id,
    name,
    evidenceIds: refs,
    description,
    kind,
    aliases,
    gender: gender
      ? [
          {
            label: gender,
            context: "Gendered description in the cited passage.",
            evidenceIds: refs,
          },
        ]
      : [],
    status: "supported",
  });
  return id;
}
function r(
  from: string,
  to: string,
  type: Relationship["type"],
  refs: string[],
  parenthood: Relationship["parenthood"] = null,
) {
  if (type !== "parent_of" && from > to) [from, to] = [to, from];
  const id = `${epic}:r:${digest(`${from}:${to}:${type}:${parenthood}`).slice(0, 20)}`;
  const old = relationships.find((r) => r.id === id);
  if (old) old.evidenceIds = [...new Set([...old.evidenceIds, ...refs])];
  else
    relationships.push({
      id,
      from,
      to,
      type,
      parenthood,
      evidenceIds: refs,
      status: "supported",
      derived: false,
      supportingRelationshipIds: [],
    });
  return id;
}
const eBhishma = ev(
  102,
  "Santanu married Ganga, who bore him a son Devavrata who was afterwards called Bhishma.",
);
const eSatyavati = ev(
  102,
  "got him married to Satyavati who was also called Gandhakali. And in her maidenhood she had a son by Parasara, named Dwaipayana. And upon her Santanu begat two other sons named Chitrangada and Vichitravirya.",
);
const eVyasa = ev(
  4,
  "that learned Brahmarshi of strict vows, the noble Dwaipayana Vyasa, offspring of Parasara",
);
const santanu = c(
  "santanu",
  "Santanu",
  [eBhishma, eSatyavati],
  "King; father of Bhishma, Chitrangada, and Vichitravirya.",
  "male",
);
const ganga = c(
  "ganga",
  "Ganga",
  [eBhishma, ev(103, "Ganga, the queen of rivers")],
  "Queen of rivers; mother of Bhishma.",
  "female",
  "deity",
);
const bhishma = c(
  "bhishma",
  "Bhishma",
  [eBhishma],
  "Son of Santanu and Ganga.",
  "male",
  "human",
  [{ label: "Devavrata", evidenceIds: [eBhishma] }],
);
const satyavati = c(
  "satyavati",
  "Satyavati",
  [eSatyavati],
  "Mother of Vyasa, Chitrangada, and Vichitravirya.",
  "female",
  "human",
  [{ label: "Gandhakali", evidenceIds: [eSatyavati] }],
);
const parasara = c(
  "parasara",
  "Parasara",
  [eSatyavati, eVyasa],
  "Rishi; father of Vyasa.",
  "male",
  "sage",
);
const vyasa = c(
  "vyasa",
  "Vyasa",
  [eSatyavati, eVyasa],
  "Brahmarshi also called Dwaipayana.",
  "male",
  "sage",
  [{ label: "Dwaipayana", evidenceIds: [eVyasa] }],
);
const chitrangada = c(
  "chitrangada-son-santanu",
  "Chitrangada",
  [eSatyavati],
  "Son of Santanu and Satyavati.",
  "male",
);
const vichitravirya = c(
  "vichitravirya",
  "Vichitravirya",
  [eSatyavati],
  "Son of Santanu and Satyavati.",
  "male",
);
r(santanu, ganga, "spouse_of", [eBhishma]);
r(santanu, satyavati, "spouse_of", [eSatyavati]);
r(santanu, bhishma, "parent_of", [eBhishma], "biological");
r(ganga, bhishma, "parent_of", [eBhishma], "biological");
r(satyavati, vyasa, "parent_of", [eSatyavati], "biological");
r(parasara, vyasa, "parent_of", [eSatyavati, eVyasa], "biological");
for (const son of [chitrangada, vichitravirya]) {
  r(santanu, son, "parent_of", [eSatyavati], "biological");
  r(satyavati, son, "parent_of", [eSatyavati], "biological");
}
const eQueens = ev(
  110,
  "he bestowed with due rites the two other daughters, Ambika and Ambalika on his younger brother Vichitravirya.",
);
const ambika = c(
  "ambika",
  "Ambika",
  [eQueens],
  "Daughter of the ruler of Kasi; wife of Vichitravirya.",
  "female",
);
const ambalika = c(
  "ambalika",
  "Ambalika",
  [eQueens],
  "Daughter of the ruler of Kasi; wife of Vichitravirya.",
  "female",
);
r(vichitravirya, ambika, "spouse_of", [eQueens]);
r(vichitravirya, ambalika, "spouse_of", [eQueens]);
const eThree = ev(
  102,
  "Dwaipayana, consenting to this, begat three children, viz., Dhritarashtra, Pandu, and Vidura.",
);
const dhritarashtra = c(
  "dhritarashtra",
  "Dhritarashtra",
  [eThree],
  "Kuru king; one of the three children begotten by Vyasa.",
  "male",
);
const pandu = c(
  "pandu",
  "Pandu",
  [eThree],
  "Kuru king; father of the five Pandavas in the dynasty.",
  "male",
);
const vidura = c(
  "vidura",
  "Vidura",
  [eThree],
  "Brother of Dhritarashtra and Pandu.",
  "male",
);
for (const son of [dhritarashtra, pandu, vidura])
  r(vyasa, son, "parent_of", [eThree], "biological");
const ePanduMother = ev(
  114,
  "Ambalika beholding the Rishi, became pale with fear And, O Bharata, beholding her so afflicted and pale with fear, Vyasa addressed her and said, 'Because thou hast been pale with fear at the sight of my grim visage, therefore, thy child shall be pale in complexion. O thou of handsome face, the name also thy child shall bear will be Pandu (the pale).'",
);
r(
  ambika,
  dhritarashtra,
  "parent_of",
  [ev(1162, "Ambika's son Dhritarashtra")],
  "unspecified",
);
r(ambalika, pandu, "parent_of", [ePanduMother], "biological");
const eMaid = ev(
  114,
  "the son thus begotten upon her by Krishna-Dwaipayana was afterwards known by the name of Vidura.",
);
const eMaidContext = ev(
  114,
  "She, however, sent unto him, a maid of hers, endued with the beauty of an Apsara and decked with her own ornaments.",
);
const maid = c(
  "vidura-mother-unnamed",
  "Vidura’s mother (unnamed maid)",
  [eMaidContext, eMaid],
  "The maid sent to Vyasa; mother of Vidura.",
  "female",
);
r(maid, vidura, "parent_of", [eMaidContext, eMaid], "biological");
const eKauravas = ev(
  102,
  "King Dhritarashtra had a hundred sons by his wife, Gandhari in consequence of the boon granted by Dwaipayana. And amongst those hundred sons of Dhritarashtra, four became celebrated. They are Duryodhana, Duhsasana, Vikarna, and Chitrasena.",
);
const gandhari = c(
  "gandhari",
  "Gandhari",
  [eKauravas],
  "Wife of Dhritarashtra; mother of the Kaurava sons.",
  "female",
);
r(dhritarashtra, gandhari, "spouse_of", [eKauravas]);
for (const name of ["Duryodhana", "Duhsasana", "Vikarna", "Chitrasena"]) {
  const son = c(
    `${name.toLowerCase()}-son-dhritarashtra`,
    name,
    [eKauravas],
    "Son of Dhritarashtra and Gandhari.",
    "male",
  );
  r(dhritarashtra, son, "parent_of", [eKauravas], "biological");
  r(gandhari, son, "parent_of", [eKauravas], "biological");
}
const eWives = ev(
  102,
  "Pandu had two jewels of wives, viz., Kunti, also called Pritha, and Madri.",
);
const kunti = c(
  "kunti",
  "Kunti",
  [eWives],
  "Wife of Pandu; also called Pritha.",
  "female",
  "human",
  [{ label: "Pritha", evidenceIds: [eWives] }],
);
const madri = c(
  "madri",
  "Madri",
  [eWives],
  "Wife of Pandu; mother of Nakula and Sahadeva.",
  "female",
);
r(pandu, kunti, "spouse_of", [eWives]);
r(pandu, madri, "spouse_of", [eWives]);
const eBirths = ev(
  102,
  "he solicited Kunti to have offspring raised for him. And Kunti said, 'Let it be', So she raised up offspring. By Dharma she had Yudhishthira; by Maruta, Bhima: and by Sakra, Arjuna.",
);
const eTwins = ev(
  128,
  "Madri thought of the twin Aswins, who coming unto her with speed begat upon her two sons that were twins named Nakula and Sahadeva",
);
const ePandavas = ev(
  128,
  "Thus, O king, were born unto Pandu five sons who were begotten by celestials",
);
const yudhishthira = c(
  "yudhishthira",
  "Yudhishthira",
  [
    eBirths,
    ePandavas,
    ev(128, "The eldest of Kunti's children was called Yudhishthira"),
  ],
  "Son of Kunti and Dharma; eldest Pandava.",
  "male",
);
const bhimaAlias = ev(126, "the birth of Vrikodara (Bhima)");
const bhima = c(
  "bhima",
  "Bhima",
  [eBirths, ePandavas],
  "Son of Kunti and the wind god; a Pandava.",
  "male",
  "human",
  [{ label: "Vrikodara", evidenceIds: [bhimaAlias] }],
);
const arjuna = c(
  "arjuna",
  "Arjuna",
  [eBirths, ePandavas],
  "Son of Kunti and Sakra; a Pandava.",
  "male",
);
const nakula = c(
  "nakula",
  "Nakula",
  [eTwins, ePandavas],
  "Son of Madri; twin brother of Sahadeva.",
  "male",
);
const sahadeva = c(
  "sahadeva",
  "Sahadeva",
  [eTwins, ePandavas],
  "Son of Madri; twin brother of Nakula.",
  "male",
);
const dharma = c(
  "dharma",
  "Dharma",
  [eBirths, ePandavas],
  "Celestial progenitor of Yudhishthira.",
  null,
  "deity",
);
const maruta = c(
  "maruta",
  "Maruta",
  [eBirths, ev(126, "Kunti then invoked Vayu. And the mighty god of wind")],
  "The wind god; progenitor of Bhima.",
  null,
  "deity",
);
const sakra = c(
  "sakra",
  "Sakra",
  [eBirths, ev(127, "invoked Sakra (the king of the gods)")],
  "King of the gods; progenitor of Arjuna.",
  null,
  "deity",
);
for (const son of [yudhishthira, bhima, arjuna])
  r(kunti, son, "parent_of", [eBirths], "biological");
for (const [father, son] of [
  [dharma, yudhishthira],
  [maruta, bhima],
  [sakra, arjuna],
])
  r(father, son, "parent_of", [eBirths], "divine");
for (const son of [nakula, sahadeva])
  r(madri, son, "parent_of", [eTwins], "biological");
for (const son of [yudhishthira, bhima, arjuna, nakula, sahadeva])
  r(pandu, son, "parent_of", [ePandavas], "social");
r(nakula, sahadeva, "sibling_of", [eTwins]);
const eDraupadi = ev(
  102,
  "there obtaining Draupadi for a wife they returned to Hastinapura.",
);
const draupadi = c(
  "draupadi",
  "Draupadi",
  [eDraupadi],
  "Common wife of the five Pandavas.",
  "female",
);
const eSons = ev(
  102,
  "Yudhishthira begat Prativindhya; Bhima, Sutasoma; Arjuna, Srutakriti; Nakula, Satanika; and Sahadeva, Srutakarman.",
);
const eMotherSons = ev(
  66,
  "unto the five Pandavas were born five sons by (their common wife) Panchali.",
);
const eMarriage = ev(
  193,
  "the handsome Draupadi had been united in marriage with the sons of Pandu.",
);
const pandavas = [yudhishthira, bhima, arjuna, nakula, sahadeva];
for (const husband of pandavas)
  r(husband, draupadi, "spouse_of", [eMarriage, ePandavas]);
for (const [father, name] of [
  [yudhishthira, "Prativindhya"],
  [bhima, "Sutasoma"],
  [arjuna, "Srutakriti"],
  [nakula, "Satanika"],
  [sahadeva, "Srutakarman"],
]) {
  const son = c(
    `${name.toLowerCase()}-son-${father.split(":").at(-1)}`,
    name,
    [eSons],
    `Son of ${characters.find((c) => c.id === father)!.name}.`,
    "male",
  );
  r(father, son, "parent_of", [eSons], "biological");
}
const eDevika = ev(
  102,
  "Yudhishthira, having obtained for his wife Devika, the daughter of Govasana of the Saivya tribe, in a self-choice ceremony, begat upon her a son named Yaudheya.",
);
const devika = c(
  "devika",
  "Devika",
  [eDevika],
  "Daughter of Govasana; wife of Yudhishthira.",
  "female",
);
const govasana = c(
  "govasana",
  "Govasana",
  [eDevika],
  "Father of Devika; of the Saivya tribe.",
  null,
);
const yaudheya = c(
  "yaudheya",
  "Yaudheya",
  [eDevika],
  "Son of Yudhishthira and Devika.",
  "male",
);
r(govasana, devika, "parent_of", [eDevika], "unspecified");
r(yudhishthira, devika, "spouse_of", [eDevika]);
r(yudhishthira, yaudheya, "parent_of", [eDevika], "biological");
r(devika, yaudheya, "parent_of", [eDevika], "biological");
const eValandhara = ev(
  102,
  "Bhima also obtaining for a wife Valandhara, the daughter of the king of Kasi, offered his own prowess as dower and begat upon her a son named Sarvaga.",
);
const valandhara = c(
  "valandhara",
  "Valandhara",
  [eValandhara],
  "Daughter of a king of Kasi; wife of Bhima.",
  "female",
);
const sarvaga = c(
  "sarvaga",
  "Sarvaga",
  [eValandhara],
  "Son of Bhima and Valandhara.",
  "male",
);
r(bhima, valandhara, "spouse_of", [eValandhara]);
r(bhima, sarvaga, "parent_of", [eValandhara], "biological");
r(valandhara, sarvaga, "parent_of", [eValandhara], "biological");
const eSubhadra = ev(
  102,
  "Arjuna also, repairing to Dwaravati, brought away by force Subhadra. the sweet-speeched sister of Vasudeva, and returned in happiness to Hastinapura. And he begat upon her a son named Abhimanyu",
);
const subhadra = c(
  "subhadra",
  "Subhadra",
  [eSubhadra],
  "Mother of Abhimanyu; wife of Arjuna.",
  "female",
);
const abhimanyu = c(
  "abhimanyu",
  "Abhimanyu",
  [eSubhadra],
  "Son of Arjuna and Subhadra.",
  "male",
);
const eSubhadraMarriage = ev(
  6,
  "Subhadra of the race of Madhu had, after forcible seizure been married by Arjuna in the city of Dwaraka",
);
r(arjuna, subhadra, "spouse_of", [eSubhadraMarriage]);
r(arjuna, abhimanyu, "parent_of", [eSubhadra], "biological");
r(subhadra, abhimanyu, "parent_of", [eSubhadra], "biological");
const eSiblings = ev(6, "Krishna and Balarama the brothers of Subhadra");
const krishna = c(
  "krishna",
  "Krishna",
  [
    eSiblings,
    ev(
      2134,
      "Know that this Krishna is Vishnu. Know that He is the soul of the universe.",
    ),
  ],
  "Brother of Subhadra and Balarama.",
  "male",
  "deity",
);
const balarama = c(
  "balarama",
  "Balarama",
  [eSiblings],
  "Brother of Krishna and Subhadra.",
  "male",
);
r(krishna, subhadra, "sibling_of", [eSiblings]);
r(balarama, subhadra, "sibling_of", [eSiblings]);
const eKarenumati = ev(
  102,
  "Nakula obtaining for his wife Karenumati, the princess of Chedi, begat upon her a son named Niramitra.",
);
const karenumati = c(
  "karenumati",
  "Karenumati",
  [eKarenumati],
  "Princess of Chedi; wife of Nakula.",
  "female",
);
const niramitra = c(
  "niramitra",
  "Niramitra",
  [eKarenumati],
  "Son of Nakula and Karenumati.",
  "male",
);
r(nakula, karenumati, "spouse_of", [eKarenumati]);
r(nakula, niramitra, "parent_of", [eKarenumati], "biological");
r(karenumati, niramitra, "parent_of", [eKarenumati], "biological");
const eVijaya = ev(
  102,
  "Sahadeva also married Vijaya, the daughter of Dyutimat, the king of Madra, obtaining her in a self-choice ceremony and begat upon her a son named Suhotra.",
);
const vijaya = c(
  "vijaya-wife-sahadeva",
  "Vijaya",
  [eVijaya],
  "Daughter of Dyutimat; wife of Sahadeva.",
  "female",
);
const dyutimat = c(
  "dyutimat",
  "Dyutimat",
  [eVijaya],
  "King of Madra; father of Vijaya.",
  null,
);
const suhotra = c(
  "suhotra-son-sahadeva",
  "Suhotra",
  [eVijaya],
  "Son of Sahadeva and Vijaya.",
  "male",
);
r(dyutimat, vijaya, "parent_of", [eVijaya], "unspecified");
r(sahadeva, vijaya, "spouse_of", [eVijaya]);
r(sahadeva, suhotra, "parent_of", [eVijaya], "biological");
r(vijaya, suhotra, "parent_of", [eVijaya], "biological");
const eHidimva = ev(
  61,
  "Bhima gained Hidimva (the sister of the Rakshasa he slew) for a wife, and it was of her that Ghatotkacha was born.",
);
const eGhatotkacha = ev(
  102,
  "Bhimasena had some time before begat upon Hidimva a son named Ghatotkacha.",
);
const hidimva = c(
  "hidimva-wife-bhima",
  "Hidimva",
  [eHidimva],
  "Wife of Bhima; sister of the Rakshasa he slew.",
  "female",
  "unknown",
);
const ghatotkacha = c(
  "ghatotkacha",
  "Ghatotkacha",
  [eHidimva, eGhatotkacha],
  "Son of Bhima and Hidimva.",
  "male",
);
r(bhima, hidimva, "spouse_of", [eHidimva]);
r(bhima, ghatotkacha, "parent_of", [eGhatotkacha], "biological");
r(hidimva, ghatotkacha, "parent_of", [eHidimva], "biological");
const eUttara = ev(
  102,
  "Abhimanyu was the perpetuator of the family. He married Uttara, the daughter of Virata, who brought forth a dead child",
);
const eParikshit = ev(
  102,
  "Vasudeva said, 'Because this child hath been born in an extinct race, therefore, he shall be called Parikshit'.",
);
const uttara = c(
  "uttara-daughter-virata",
  "Uttara",
  [eUttara],
  "Daughter of Virata; wife of Abhimanyu.",
  "female",
);
const virata = c("virata", "Virata", [eUttara], "Father of Uttara.", null);
const parikshit = c(
  "parikshit-son-abhimanyu",
  "Parikshit",
  [eUttara, eParikshit],
  "Child of Abhimanyu and Uttara, born dead in the cited account.",
  "male",
);
r(virata, uttara, "parent_of", [eUttara], "unspecified");
r(abhimanyu, uttara, "spouse_of", [eUttara]);
r(uttara, parikshit, "parent_of", [eUttara, eParikshit], "biological");
r(abhimanyu, parikshit, "parent_of", [eUttara, eParikshit], "biological");
const eJanamejaya = ev(
  102,
  "Parikshit married Madravati, thy mother, O king, and thou art born to her, O Janamejaya!",
);
const madravati = c(
  "madravati",
  "Madravati",
  [eJanamejaya],
  "Wife of Parikshit; mother of Janamejaya.",
  "female",
);
const janamejaya = c(
  "janamejaya-son-parikshit",
  "Janamejaya",
  [
    eJanamejaya,
    ev(
      3,
      "royal sage Janamejaya and in the presence also of that chief of Princes, the son of Parikshit",
    ),
  ],
  "Son of Parikshit and Madravati; listener at the snake sacrifice.",
  "male",
);
r(parikshit, madravati, "spouse_of", [eJanamejaya]);
r(parikshit, janamejaya, "parent_of", [eJanamejaya], "biological");
r(madravati, janamejaya, "parent_of", [eJanamejaya], "biological");
const eVapushtama = ev(
  102,
  "Thou hast also begotten two sons on thy wife Vapushtama, named Satanika and Sankukarna.",
);
const vapushtama = c(
  "vapushtama",
  "Vapushtama",
  [eVapushtama],
  "Wife of Janamejaya; mother of Satanika and Sankukarna.",
  "female",
);
r(janamejaya, vapushtama, "spouse_of", [eVapushtama, eJanamejaya]);
for (const name of ["Satanika", "Sankukarna"]) {
  const son = c(
    `${name.toLowerCase()}-son-janamejaya`,
    name,
    [eVapushtama],
    "Son of Janamejaya and Vapushtama.",
    "male",
  );
  r(janamejaya, son, "parent_of", [eVapushtama, eJanamejaya], "biological");
  r(vapushtama, son, "parent_of", [eVapushtama], "biological");
}
const ePuru = ev(
  101,
  "Puru had a wife of the name of Kausalya, on whom he begat a son named Janamejaya who performed three horse-sacrifices and a sacrifice called Viswajit.",
);
const puru = c(
  "puru",
  "Puru",
  [ePuru],
  "Ancestor in the Paurava genealogy; husband of Kausalya.",
  "male",
);
const kausalya = c(
  "kausalya-wife-puru",
  "Kausalya",
  [ePuru],
  "Wife of Puru; mother of an earlier Janamejaya.",
  "female",
);
const earlierJanamejaya = c(
  "janamejaya-son-puru",
  "Janamejaya",
  [ePuru],
  "Son of Puru and Kausalya; an ancestor, distinct from the snake-sacrifice king.",
  "male",
);
r(puru, kausalya, "spouse_of", [ePuru]);
r(puru, earlierJanamejaya, "parent_of", [ePuru], "biological");
r(kausalya, earlierJanamejaya, "parent_of", [ePuru], "biological");
const eSauti = ev(
  3,
  "Ugrasrava, the son of Lomaharshana, surnamed Sauti, well-versed in the Puranas",
);
const sauti = c(
  "ugrasrava-sauti",
  "Ugrasrava",
  [eSauti],
  "Narrator, surnamed Sauti; son of Lomaharshana.",
  "male",
  "unknown",
  [{ label: "Sauti", evidenceIds: [eSauti] }],
);
const lomaharshana = c(
  "lomaharshana",
  "Lomaharshana",
  [eSauti],
  "Father of the narrator Ugrasrava.",
  null,
  "unknown",
);
r(lomaharshana, sauti, "parent_of", [eSauti], "unspecified");
c(
  "saunaka",
  "Saunaka",
  [ev(3, "the twelve years' sacrifice of Saunaka, surnamed Kulapati")],
  "Host of the twelve-year sacrifice in the framing narrative.",
  null,
  "unknown",
);
const eDog = ev(
  17,
  "there arrived at the spot an offspring of Sarama (the celestial bitch).",
);
const sarama = c(
  "sarama",
  "Sarama",
  [eDog],
  "Celestial dog; mother of the unnamed dog at the sacrifice.",
  "female",
  "animal",
);
const dog = c(
  "sarama-offspring-unnamed",
  "Sarama’s son (unnamed dog)",
  [
    eDog,
    ev(
      17,
      "His mother Sarama hearing this and much distressed at the affliction of her son",
    ),
  ],
  "The individual dog beaten at Janamejaya’s sacrifice.",
  "male",
  "animal",
);
r(sarama, dog, "parent_of", [eDog], "unspecified");

// Include supporting family passages in character profiles as well as on edges.
for (const relation of relationships)
  for (const id of [relation.from, relation.to]) {
    const person = characters.find((character) => character.id === id)!;
    person.evidenceIds = [
      ...new Set([...person.evidenceIds, ...relation.evidenceIds]),
    ];
  }
// Explicitly derived, without claiming full versus half siblinghood.
const groups = new Map<string, Relationship[]>();
relationships
  .filter((r) => r.type === "parent_of")
  .forEach((r) => groups.set(r.from, [...(groups.get(r.from) ?? []), r]));
for (const rows of groups.values())
  for (let i = 0; i < rows.length; i++)
    for (let j = i + 1; j < rows.length; j++) {
      let from = rows[i].to;
      let to = rows[j].to;
      if (from === to) continue;
      if (from > to) [from, to] = [to, from];
      if (
        relationships.some(
          (r) => r.type === "sibling_of" && r.from === from && r.to === to,
        )
      )
        continue;
      const id = r(from, to, "sibling_of", [
        ...new Set([...rows[i].evidenceIds, ...rows[j].evidenceIds]),
      ]);
      const relation = relationships.find((r) => r.id === id)!;
      relation.derived = true;
      relation.supportingRelationshipIds = [rows[i].id, rows[j].id];
    }
const dataset = DatasetSchema.parse({
  schemaVersion: 1,
  epicId: epic,
  title: "Mahabharata",
  sources: [
    {
      id: corpus.sourceId,
      title: "The Complete Mahabharata in English",
      translator: "Kisari Mohan Ganguli",
      sha256: corpus.sourceHash,
      totalPages: corpus.pages.length,
    },
  ],
  characters,
  relationships,
  evidence,
  coverage: {
    totalPages: corpus.pages.length,
    totalBooks: 18,
    totalWords: corpus.totalWords,
    totalBatches: corpus.batches.length,
    processedBatchIds: [],
    reviewedBatchIds: [],
    processedPages: [],
    reviewedPages: [],
    reviewedBooks: [],
    unresolvedCount: 0,
    phase: "starter",
    message:
      "An initial family atlas curated from cited passages. Full-book extraction and omission checks have not yet completed. Selected passage review is not counted as complete page coverage.",
    updatedAt: new Date().toISOString(),
  },
});
await writeJSON(datasetPath(epic), dataset);
console.log(
  `Curated ${characters.length} characters, ${relationships.length} relationships, ${evidence.length} source excerpts. Full-book coverage remains 0/${corpus.batches.length}.`,
);
