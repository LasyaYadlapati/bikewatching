mapboxgl.accessToken =
  "pk.eyJ1IjoibGFzeWF5YWRsYXBhdGkiLCJhIjoiY203NnpkM3k4MHpzZTJ0cHJxZmxtbXh4ZSJ9.LIyAFsiBTDfShVCMShQZMw";

const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/streets-v12",
  center: [-71.09415, 42.36027],
  zoom: 12,
  minZoom: 5,
  maxZoom: 18,
});

const svg = d3.select("#map").select("svg");
let stations = [];

function getCoords(station) {
  const point = new mapboxgl.LngLat(+station.lon, +station.lat);
  const { x, y } = map.project(point);
  return { cx: x, cy: y };
}

map.on("load", () => {
  map.addSource("boston_route", {
    type: "geojson",
    data: "https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson?...",
  });

  map.addLayer({
    id: "bike-lanes",
    type: "line",
    source: "boston_route",
    paint: {
      "line-color": "green",
      "line-width": 3,
      "line-opacity": 0.4,
    },
  });

  map.addSource("cambridge_route", {
    type: "geojson",
    data: "https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson",
  });

  map.addLayer({
    id: "cambridge-bike-lanes",
    type: "line",
    source: "cambridge_route",
    paint: {
      "line-color": "green",
      "line-width": 3,
      "line-opacity": 0.4,
    },
  });

  const jsonurl = "https://dsc106.com/labs/lab07/data/bluebikes-stations.json";
  d3.json(jsonurl)
    .then((jsonData) => {
      stations = jsonData.data.stations;

      const csvurl =
        "https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv";
      d3.csv(csvurl)
        .then((trips) => {
          departures = d3.rollup(
            trips,
            (v) => v.length,
            (d) => d.start_station_id
          );

          const arrivals = d3.rollup(
            trips,
            (v) => v.length,
            (d) => d.end_station_id
          );

          stations = stations.map((station) => {
            let id = station.short_name;
            station.arrivals = arrivals.get(id) ?? 0;
            station.departures = departures.get(id) ?? 0;
            station.totalTraffic = station.arrivals + station.departures;

            return station;
          });

          const radiusScale = d3
            .scaleSqrt()
            .domain([0, d3.max(stations, (d) => d.totalTraffic)])
            .range([0, 25]);

          const circles = svg
            .selectAll("circle")
            .data(stations)
            .enter()
            .append("circle")
            .attr("r", (d) => radiusScale(d.totalTraffic))
            .attr("fill", "steelblue")
            .attr("stroke", "white")
            .attr("stroke-width", 1)
            .attr("opacity", 0.7)
            .each(function (d) {
              d3.select(this)
                .append("title")
                .text(
                  `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`
                );
            });

          function updatePositions() {
            circles
              .attr("cx", (d) => getCoords(d).cx)
              .attr("cy", (d) => getCoords(d).cy);
          }
          updatePositions();

          map.on("move", updatePositions);
          map.on("zoom", updatePositions);
          map.on("resize", updatePositions);
          map.on("moveend", updatePositions);

          function minutesSinceMidnight(date) {
            return date.getHours() * 60 + date.getMinutes();
          }

          for (let trip of trips) {
            trip.started_at = new Date(trip.started_at);
            trip.ended_at = new Date(trip.ended_at);
          }

          let timeFilter = -1;

          function filterTripsbyTime() {
            let filteredTrips = [];
            let filteredArrivals = new Map();
            let filteredDepartures = new Map();
            let filteredStations = [];
            filteredTrips =
              timeFilter === -1
                ? trips
                : trips.filter((trip) => {
                    const startedMinutes = minutesSinceMidnight(
                      trip.started_at
                    );
                    const endedMinutes = minutesSinceMidnight(trip.ended_at);
                    return (
                      Math.abs(startedMinutes - timeFilter) <= 60 ||
                      Math.abs(endedMinutes - timeFilter) <= 60
                    );
                  });

            filteredDepartures = d3.rollup(
              filteredTrips,
              (v) => v.length,
              (d) => d.start_station_id
            );

            filteredArrivals = d3.rollup(
              filteredTrips,
              (v) => v.length,
              (d) => d.end_station_id
            );

            filteredStations = stations.map((station) => {
              let newStation = { ...station };
              let id = newStation.short_name;
              newStation.arrivals = filteredArrivals.get(id) ?? 0;
              newStation.departures = filteredDepartures.get(id) ?? 0;
              newStation.totalTraffic =
                newStation.arrivals + newStation.departures;
              return newStation;
            });

            const currentStations =
              timeFilter === -1 ? stations : filteredStations;
            const radiusRange = timeFilter === -1 ? [0, 25] : [0, 22];

            const updatedRadiusScale = d3
              .scaleSqrt()
              .domain([0, d3.max(currentStations, (d) => d.totalTraffic)])
              .range(radiusRange);

            // update each circle's radius using the new scale
            svg
              .selectAll("circle")
              .data(currentStations, (d) => d.short_name) // use a unique key
              .attr("r", (d) => updatedRadiusScale(d.totalTraffic))
              .each(function (d) {
                d3.select(this).select("title").remove();
                d3.select(this)
                  .append("title")
                  .text(
                    `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`
                  );
              })
              .style("--departure-ratio", (d) =>
                stationFlow(d.departures / d.totalTraffic)
              );

            function updatePositions() {
              circles
                .attr("cx", (d) => getCoords(d).cx)
                .attr("cy", (d) => getCoords(d).cy);
            }
            updatePositions();

            map.on("move", updatePositions);
            map.on("zoom", updatePositions);
            map.on("resize", updatePositions);
            map.on("moveend", updatePositions);
          }

          const timeSlider = document.getElementById("time-slider");
          const selectedTime = document.getElementById("selected-time");
          const anyTimeLabel = document.getElementById("any-time");

          function formatTime(minutes) {
            const date = new Date(0, 0, 0, 0, minutes); // Set hours & minutes
            return date.toLocaleString("en-US", { timeStyle: "short" }); // Format as HH:MM AM/PM
          }

          function updateTimeDisplay() {
            timeFilter = Number(timeSlider.value); // Get slider value
            if (timeFilter === -1) {
              selectedTime.textContent = ""; // Clear time display
              anyTimeLabel.style.display = "block"; // Show "(any time)"
            } else {
              selectedTime.textContent = formatTime(timeFilter); // Display formatted time
              anyTimeLabel.style.display = "none"; // Hide "(any time)"
            }
            filterTripsbyTime();
          }

          timeSlider.addEventListener("input", updateTimeDisplay);
          updateTimeDisplay();
        })
        .catch((error) => {
          console.error("Error loading traffic data:", error);
        });
    })
    .catch((error) => {
      console.error("Error loading JSON:", error);
    });
});

let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);
