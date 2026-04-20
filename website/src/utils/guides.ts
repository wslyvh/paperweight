
import fs from 'fs'
import { join } from 'path'
import matter from 'gray-matter'

const baseFolder = 'src/content'

export interface Guide {
  slug: string
  title: string
  description: string
  body: string
}

export function GetGuides() {
  const dir = join(process.cwd(), baseFolder, 'guides')
  const files = fs.readdirSync(dir, { withFileTypes: true })
    .filter(i => i.isFile() && i.name.endsWith('.md'))

  const items = files.map(i => {
    const fullPath = join(dir, i.name)
    const content = fs.readFileSync(fullPath, 'utf8')
    if (!content) {
      console.log('File has no content..', i.name)
    }

    if (content) {
      const doc = matter(content)
      return {
        ...doc.data,
        slug: i.name.replace('.md', ''),
        body: doc.content
      }
    }
  }).filter(i => !!i) as Array<Guide>

  return items
}

export function GetGuide(slug: string) {
  return GetGuides().find((guide) => guide.slug === slug);
}