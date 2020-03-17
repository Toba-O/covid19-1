import {
  ResponsiveContainer,
  LineChart,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Line,
  Label
} from 'recharts'
import { orderBy, groupBy, reverse, find } from 'lodash'
import commaNumber from 'comma-number'
import theme from 'src/theme'
import { useState, useEffect } from 'react'

const addDays = (date, days) => {
  let d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

const daysBetween = (date1, date2) => {
  const oneDay = 24 * 60 * 60 * 1000
  return Math.round((date1.getTime() - date2.getTime()) / oneDay)
}

const calculateDayOffsets = (sortedDailyCounts = [], benchmarkCountryISO) => {
  const countryBenchmark = benchmarkCountryISO
  const countryCounts = groupBy(sortedDailyCounts, 'country.iso')
  const benchmarkCounts = countryCounts[countryBenchmark] || []
  const revBenchmarkCounts = reverse(benchmarkCounts)

  let countries = {}

  revBenchmarkCounts.forEach((count, i) => {
    if (i == revBenchmarkCounts.length - 1) return

    const currentCount = count
    const previousCount = revBenchmarkCounts[i + 1]

    for (const country in countryCounts) {
      const counts = countryCounts[country]

      counts.forEach((count) => {
        if (countries[country]) return

        if (
          count.totalCases < currentCount.totalCases &&
          count.totalCases > previousCount.totalCases
        ) {
          countries[country] = daysBetween(
            new Date(currentCount.date.date),
            new Date(count.date.date)
          )
        }
      })
    }
  })

  return countries
}

const yAxisFormatter = (i) =>
  i
    .toString()
    .replace(/0{6}$/, 'M')
    .replace(/(\d+)(\d0{2})$/, (a, b) => `${b}k`)
const countryFromKey = (label, countries) =>
  find(countries, ['iso', label.toString().slice(0, 3)]).name

const Chart = ({
  dailyCounts = [],
  countries = [],
  enabledCountries,
  defaultCountry
  // log
}) => {
  // sort dailyCounts for all later operations
  const sortedDailyCounts = orderBy(dailyCounts, 'date.date')
  const offsets = calculateDayOffsets(sortedDailyCounts, defaultCountry)
  // console.log(offsets)

  const offsetDailyCounts = sortedDailyCounts.map((origCount) => {
    // deep clone
    let count = JSON.parse(JSON.stringify(origCount))

    let offset = offsets[count.country.iso]
    if (!offset) {
      return count
    } // in case of benchmark

    let newDateStr = addDays(new Date(count.date.date), offset)

    // extract the YYYY-DD-MM portion
    count.date.date = new Date(
      newDateStr.toISOString().substring(0, 10)
    ).toISOString()

    return count
  })
  const sortedOffsetDailyCounts = orderBy(offsetDailyCounts, 'date.date')

  // Assemble chart display
  let days = {}

  sortedOffsetDailyCounts.forEach((count) => {
    days[count.date.date] = days[count.date.date] || {}

    days[count.date.date][`${count.country.iso}TotalCases`] = count.totalCases
    days[count.date.date][`${count.country.iso}TotalDeaths`] = count.totalDeaths
  })

  // Calculate X axis numbers to show how many days ahead / behind a country is
  let xAxis = []

  const countryCounts = groupBy(sortedDailyCounts, 'country.iso')
  // Highest date in benchmark country
  //
  const maxBenchmarkDate =
    countryCounts[defaultCountry][countryCounts[defaultCountry].length - 1].date
      .date

  for (const day in days) {
    const daysBehind = daysBetween(new Date(day), new Date(maxBenchmarkDate))

    days[day]['daysBehind'] = daysBehind
  }

  const totalDaysInChart = Object.keys(days).length

  // Prepare chart data
  const [chartData, setChartData] = useState([])
  useEffect(() => {
    setChartData(
      Object.keys(days).map((day) => ({
        date: day,
        ...days[day]
      }))
    )
  }, [dailyCounts])
  // Sorting
  useEffect(() => {
    setChartData((chartData) => orderBy(chartData, 'date'))
  }, [dailyCounts])

  return (
    <ResponsiveContainer height={512} id="primary">
      <LineChart
        data={chartData}
        margin={{ top: 10, right: 10, bottom: 25, left: 15 }}
      >
        <XAxis dataKey="daysBehind">
          <Label
            value={`Days vs ${countryFromKey(
              defaultCountry,
              countries
            )} as of ${new Date(maxBenchmarkDate)
              .toISOString()
              .substring(0, 10)}`}
            position="bottom"
          />
        </XAxis>
        <YAxis
          tickFormatter={yAxisFormatter}
          label={{
            value: 'COVID-19 Cases',
            angle: -90,
            position: 'insideLeft'
          }}
        />
        <Tooltip
          separator=": "
          formatter={(value, key) => [
            commaNumber(value),
            countryFromKey(key, countries)
          ]}
        />
        <CartesianGrid stroke={theme.colors.snow} strokeDasharray="8 8" />
        {enabledCountries.map((iso) => (
          <Line
            key={iso}
            type="monotone"
            dataKey={`${iso}TotalCases`}
            stroke={theme.colors[iso]}
            strokeWidth={defaultCountry[0] === iso ? 5 : 3}
            dot={false}
            activeDot={{ r: 8 }}
          />
        ))}
        <style>{`
          .recharts-label {
            fill: ${theme.colors.muted};
          }
          .recharts-default-tooltip {
            border-radius: 0.375rem;
          }
          .recharts-tooltip-label {
            color: ${theme.colors.muted};
            font-family: ${theme.fonts.sans};
            font-size: 2rem;
            line-height: 1.5;
          }
          #primary .recharts-tooltip-label:after {
            content: ' days';
          }
          #primary .recharts-tooltip-item {
            font-family: ${theme.fonts.serif};
            font-size: 1rem;
          }
          @media (prefers-color-scheme: dark) {
            .recharts-default-tooltip {
              background-color: #1e1e1e !important;
            }
            .recharts-label {
              fill: ${theme.colors.snow};
            }
            .recharts-tooltip-label {
              color: ${theme.colors.snow};
            }
            .recharts-layer:not(.recharts-active-dot) .recharts-dot {
              fill: #1e1e1e !important;
            }
            line.recharts-cartesian-axis-line,
            line.recharts-cartesian-axis-tick-line,
            .recharts-cartesian-grid line {
              opacity: 0.25 !important;
            }
          }
        `}</style>
      </LineChart>
    </ResponsiveContainer>
  )
}

export default Chart
