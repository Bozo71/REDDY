import { createFileRoute } from "@tanstack/react-router";

import { rutaUsluge } from "../usluge-ruta";

export const Route = createFileRoute("/video-nadzor-podgorica")(rutaUsluge("/video-nadzor-podgorica"));
