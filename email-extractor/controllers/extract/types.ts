export type ExtractInput = {
  email_body: string;
  table: "seo" | "email" | "paid";
};

export type ExtractOutput = {
  title: string;
}[];
