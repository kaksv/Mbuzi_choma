export type MeatPackage = {
  id: string
  title: string
  weightKg: number
  priceUGX: number
  photoUrl: string
  popular?: boolean
}

import quarter025Img from '../assets/choma/quarter-025.jpg'
import half05Img from '../assets/choma/half-05.jpg'
import one1Img from '../assets/choma/one-1.jpg'
import two2Img from '../assets/choma/two-2.jpg'
import three3Img from '../assets/choma/three-3.jpg'
import five5Img from '../assets/choma/five-5.jpg'

export const meatPackages: MeatPackage[] = [
  {
    id: 'quarter-025',
    title: 'Quarter (0.25kg)',
    weightKg: 0.25,
    priceUGX: 20000,
    photoUrl: quarter025Img,
  },
  {
    id: 'half-05',
    title: 'Half (0.5kg)',
    weightKg: 0.5,
    priceUGX: 35000,
    photoUrl: half05Img,
  },
  {
    id: 'one-1',
    title: '1kg',
    weightKg: 1,
    priceUGX: 65000,
    photoUrl: one1Img,
    popular: true,
  },
  {
    id: 'two-2',
    title: '2kgs',
    weightKg: 2,
    priceUGX: 120000,
    photoUrl: two2Img,
  },
  {
    id: 'three-3',
    title: '3kgs',
    weightKg: 3,
    priceUGX: 175000,
    photoUrl: three3Img,
  },
  {
    id: 'five-5',
    title: '5kgs',
    weightKg: 5,
    priceUGX: 285000,
    photoUrl: five5Img,
  },
]

