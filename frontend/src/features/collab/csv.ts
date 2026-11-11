import Papa from 'papaparse'

// papaparse sniffs the delimiter (comma, tab, semicolon, pipe) from the rows themselves
export function readTable(text: string): string[][] {
  const { data } = Papa.parse<string[]>(text.replace(/^﻿/, ''), {
    delimiter: '',
    skipEmptyLines: 'greedy',
  })
  return data
}
