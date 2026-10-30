import assert from 'node:assert/strict'
import test from 'node:test'
import {
  convertMeasurementValue,
  convertMeasurementValues,
  copyMeasurementValues,
  getMeasurementGarmentsForOrder,
  measurementFields,
} from './measurementTemplates.js'

test('garment templates use distinct professional field sets', () => {
  assert.deepEqual(measurementFields.Blouse, [
    'Bust/Chest', 'Waist', 'Shoulder', 'Sleeve Length', 'Armhole',
    'Blouse Length', 'Front Neck Depth', 'Back Neck Depth', 'Under Bust',
  ])
  assert.deepEqual(measurementFields.Shirt, [
    'Chest', 'Waist', 'Shoulder', 'Neck/Collar', 'Sleeve Length',
    'Shirt Length', 'Bicep', 'Cuff',
  ])
  assert.deepEqual(measurementFields.Trouser, [
    'Waist', 'Hip', 'Thigh', 'Knee', 'Bottom', 'Inseam', 'Outseam', 'Crotch',
  ])
  assert.deepEqual(measurementFields['Suit/Blazer'], [
    'Chest', 'Waist', 'Shoulder', 'Sleeve', 'Jacket Length', 'Back Width', 'Armhole', 'Neck',
  ])
})

test('measurement values convert accurately between inches and centimetres', () => {
  assert.equal(convertMeasurementValue('10', 'in', 'cm'), '25.4')
  assert.equal(convertMeasurementValue('25.4', 'cm', 'in'), '10')
  assert.deepEqual(convertMeasurementValues({ Chest: '40', Custom: '2.5', Empty: '' }, 'in', 'cm'), {
    Chest: '101.6',
    Custom: '6.35',
    Empty: '',
  })
  assert.equal(convertMeasurementValue('not-a-number', 'in', 'cm'), 'not-a-number')
})

test('order garment aliases find previous corresponding measurement profiles', () => {
  assert.deepEqual(getMeasurementGarmentsForOrder('Formal shirt'), ['Shirt', 'Formal shirt'])
  assert.deepEqual(getMeasurementGarmentsForOrder('Two-piece suit'), ['Suit/Blazer', 'Two-piece suit'])
  assert.deepEqual(getMeasurementGarmentsForOrder('Trouser'), ['Trouser'])
})

test('copying an older blouse profile maps renamed template fields and keeps custom details', () => {
  assert.deepEqual(copyMeasurementValues({
    garment: 'Blouse',
    values: {
      Bust: '34',
      Sleeve: '10',
      Length: '15',
      'Under bust': '30',
      'Custom lining': '2',
    },
  }), {
    'Bust/Chest': '34',
    'Sleeve Length': '10',
    'Blouse Length': '15',
    'Under Bust': '30',
    'Custom lining': '2',
  })
})
