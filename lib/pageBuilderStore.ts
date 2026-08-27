import { promises as fs } from "fs";
import { getPagesDataFile } from "./storagePaths";
import { validatePageStore, type PageStore } from "./pageBuilder";

export async function readPageStore(): Promise<PageStore> {
  const store = JSON.parse(await fs.readFile(getPagesDataFile(), "utf8")) as PageStore;
  validatePageStore(store);
  return store;
}
