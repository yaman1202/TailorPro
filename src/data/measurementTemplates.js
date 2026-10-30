export const measurementTemplates = [
  {
    group: 'Women',
    garments: [
      {
        name: 'Blouse',
        fields: ['Bust/Chest', 'Waist', 'Shoulder', 'Sleeve Length', 'Armhole', 'Blouse Length', 'Front Neck Depth', 'Back Neck Depth', 'Under Bust'],
      },
      {
        name: 'Suit',
        fields: ['Bust', 'Waist', 'Hip', 'Shoulder', 'Sleeve', 'Top length', 'Armhole', 'Neck', 'Front neck depth', 'Back neck depth', 'Trouser waist', 'Trouser hip', 'Inseam', 'Outseam'],
      },
      {
        name: 'Dress',
        fields: ['Bust', 'Under bust', 'Waist', 'Hip', 'Shoulder', 'Sleeve', 'Dress length', 'Armhole', 'Neck', 'Front neck depth', 'Back neck depth', 'Apex to waist', 'Across back'],
      },
    ],
  },
  {
    group: 'Men',
    garments: [
      {
        name: 'Shirt',
        fields: ['Chest', 'Waist', 'Shoulder', 'Neck/Collar', 'Sleeve Length', 'Shirt Length', 'Bicep', 'Cuff'],
      },
      {
        name: 'Trouser',
        fields: ['Waist', 'Hip', 'Thigh', 'Knee', 'Bottom', 'Inseam', 'Outseam', 'Crotch'],
      },
      {
        name: 'Suit/Blazer',
        fields: ['Chest', 'Waist', 'Shoulder', 'Sleeve', 'Jacket Length', 'Back Width', 'Armhole', 'Neck'],
      },
      {
        name: 'Kurta',
        fields: ['Neck', 'Chest', 'Waist', 'Hip', 'Shoulder', 'Sleeve', 'Kurta length', 'Bicep', 'Cuff', 'Armhole', 'Side slit', 'Neck depth'],
      },
    ],
  },
  {
    group: 'Previous profile types',
    garments: [
      {
        name: 'Formal shirt',
        fields: ['Neck', 'Chest', 'Waist', 'Shoulder', 'Sleeve', 'Shirt length', 'Bicep', 'Cuff', 'Armhole', 'Front length', 'Back length', 'Wrist'],
      },
      {
        name: 'Two-piece suit',
        fields: ['Chest', 'Waist', 'Shoulder', 'Sleeve', 'Jacket length', 'Bicep', 'Armhole', 'Neck', 'Trouser waist', 'Hip', 'Thigh', 'Inseam', 'Outseam', 'Knee', 'Bottom'],
      },
    ],
  },
]

export const measurementFields = Object.fromEntries(
  measurementTemplates.flatMap(({ garments }) => garments.map(({ name, fields }) => [name, fields])),
)

const orderGarmentAliases = {
  'Formal shirt': ['Shirt', 'Formal shirt'],
  'Two-piece suit': ['Suit/Blazer', 'Two-piece suit'],
  'Silk blouse': ['Blouse'],
  'Anarkali suit': ['Suit'],
  'Evening dress': ['Dress'],
}

export function getMeasurementGarmentsForOrder(garment) {
  return orderGarmentAliases[garment] || [garment]
}

export function convertMeasurementValue(value, fromUnit, toUnit) {
  if (value === '' || fromUnit === toUnit) return value

  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return value

  const converted = fromUnit === 'in' && toUnit === 'cm'
    ? numericValue * 2.54
    : fromUnit === 'cm' && toUnit === 'in'
      ? numericValue / 2.54
      : numericValue

  return Number(converted.toFixed(2)).toString()
}

export function convertMeasurementValues(values, fromUnit, toUnit) {
  return Object.fromEntries(
    Object.entries(values).map(([field, value]) => [
      field,
      convertMeasurementValue(value, fromUnit, toUnit),
    ]),
  )
}

export function copyMeasurementValues(profile) {
  const values = { ...profile.values }
  if (profile.garment === 'Blouse') {
    const aliases = {
      'Bust/Chest': ['Bust'],
      'Sleeve Length': ['Sleeve'],
      'Blouse Length': ['Blouse length', 'Length'],
      'Front Neck Depth': ['Front neck depth'],
      'Back Neck Depth': ['Back neck depth'],
      'Under Bust': ['Under bust'],
    }
    for (const [field, previousNames] of Object.entries(aliases)) {
      if (values[field] === undefined) {
        const previousName = previousNames.find((name) => values[name] !== undefined)
        if (previousName) values[field] = values[previousName]
      }
      previousNames.forEach((previousName) => delete values[previousName])
    }
  }
  return values
}
