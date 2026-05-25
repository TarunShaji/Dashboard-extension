export interface IAIClient {
  extractTasks(emailBody: string, table: string): Promise<string[]>;
}
