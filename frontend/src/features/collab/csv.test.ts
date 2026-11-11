import { describe, expect, it } from 'vitest'
import { readTable } from './csv'

describe('readTable', () => {
  it('reads plain rows', () => {
    expect(readTable('name,role\nAna,Designer\nSam,Engineer')).toEqual([
      ['name', 'role'], ['Ana', 'Designer'], ['Sam', 'Engineer'],
    ])
  })

  it('handles quotes, doubled quotes, commas and newlines inside quotes', () => {
    expect(readTable('name,quote\n"Lee, Jo","She said ""hi""\nthen left"')).toEqual([
      ['name', 'quote'], ['Lee, Jo', 'She said "hi"\nthen left'],
    ])
  })

  it('takes Windows line endings, a byte order mark and a missing final newline', () => {
    expect(readTable('﻿a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']])
    expect(readTable('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']])
  })

  it('detects tab, semicolon and pipe separated files', () => {
    expect(readTable('name\trole\nAna\tDesigner, lead')).toEqual([['name', 'role'], ['Ana', 'Designer, lead']])
    expect(readTable('name;price\nTea;2,50\nCake;3,10')).toEqual([['name', 'price'], ['Tea', '2,50'], ['Cake', '3,10']])
    expect(readTable('name|city\nAna|Lisbon')).toEqual([['name', 'city'], ['Ana', 'Lisbon']])
  })

  it('keeps empty cells but skips blank lines', () => {
    expect(readTable('a,b,c\n1,,3\n\n , \n4,5,')).toEqual([['a', 'b', 'c'], ['1', '', '3'], ['4', '5', '']])
    expect(readTable('')).toEqual([])
  })

  it('reads a single column', () => {
    expect(readTable('name\nAna\nSam')).toEqual([['name'], ['Ana'], ['Sam']])
  })
})
