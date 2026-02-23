type ClassInput =
  | string
  | number
  | false
  | null
  | undefined
  | ClassInput[];

function flattenClasses(inputs: ClassInput[], result: string[]) {
  for (const input of inputs) {
    if (!input) continue;
    if (Array.isArray(input)) {
      flattenClasses(input, result);
      continue;
    }
    result.push(String(input));
  }
}

export function cn(...inputs: ClassInput[]) {
  const values: string[] = [];
  flattenClasses(inputs, values);
  return values.join(' ');
}
