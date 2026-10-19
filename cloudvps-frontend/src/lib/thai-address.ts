// Decode thailand-address compressed db.json and provide lookup helpers.
// Data cached in module scope — decoded once per runtime.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const rawDb = require("thailand-address/lib/database/db.json") as {
  data: unknown[]
  lookup: string
  words: string
}

interface AddressRecord {
  province: string
  district: string
  subdistrict: string
  zipcode: string
}

let _cache: AddressRecord[] | null = null

function load(): AddressRecord[] {
  if (_cache) return _cache

  const lookupArr = rawDb.lookup.split("|")
  const wordsArr = rawDb.words.split("|")

  const resolve = (val: string | number): string => {
    const str = typeof val === "number" ? lookupArr[val] : val
    return str.replace(/[A-Za-z]/g, (ch) => {
      const code = ch.charCodeAt(0)
      return wordsArr[code < 97 ? code - 65 : 26 + code - 97] ?? ch
    })
  }

  const records: AddressRecord[] = []

  for (const provinceRow of rawDb.data) {
    const pArr = provinceRow as [string | number, ...unknown[]]
    const e = (pArr as unknown[]).length === 3 ? 2 : 1
    const province = resolve(pArr[0])
    const districts = pArr[e] as unknown[]

    for (const districtRow of districts) {
      const dArr = districtRow as [string | number, ...unknown[]]
      const district = resolve(dArr[0])
      const subdistricts = dArr[e] as unknown[]

      for (const subdistrictRow of subdistricts) {
        const sArr = subdistrictRow as [string | number, ...unknown[]]
        const subdistrict = resolve(sArr[0])
        const zipRaw = sArr[e]
        const zipcodes = Array.isArray(zipRaw) ? zipRaw : [zipRaw]

        for (const zip of zipcodes as number[]) {
          records.push({ province, district, subdistrict, zipcode: String(zip) })
        }
      }
    }
  }

  _cache = records
  return records
}

export function getProvinces(): string[] {
  return [...new Set(load().map((r) => r.province))].sort()
}

export function getDistricts(province: string): string[] {
  return [...new Set(load().filter((r) => r.province === province).map((r) => r.district))].sort()
}

export function getSubdistricts(province: string, district: string): string[] {
  return [
    ...new Set(
      load()
        .filter((r) => r.province === province && r.district === district)
        .map((r) => r.subdistrict),
    ),
  ].sort()
}

export function getZipcode(province: string, district: string, subdistrict: string): string {
  return (
    load().find(
      (r) => r.province === province && r.district === district && r.subdistrict === subdistrict,
    )?.zipcode ?? ""
  )
}
