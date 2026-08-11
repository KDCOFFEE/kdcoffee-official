import { promises as fs } from "fs";
import path from "path";
import { getHomepageData } from "@/data/homepageData";
import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";
import HomepageV3 from "@/components/home/HomepageV3";
export const dynamic="force-dynamic";
export default async function Home(){
 const [homepageData,website]=await Promise.all([getHomepageData(),fs.readFile(path.join(process.cwd(),"public","data","website-data.json"),"utf8").then(JSON.parse)]);
 const products=website.menu?.products||[];
 return <main><Header/><HomepageV3 homepageData={homepageData as any} products={products}/><Footer/></main>;
}
