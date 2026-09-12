import { useRpc, useSettings } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { listPets, loadPet, preferences } from "../shared/contracts";

export function usePetLibrary(hostId: string) {
  const settings = useSettings(preferences);
  const list = useRpc(listPets);
  const root = settings.status === "ready" ? settings.values.root : "";
  const key = settings.status === "ready" ? settings.values.petKey : "";
  const library = useQuery({
    queryKey: ["paseo-pet", "list", hostId, root],
    queryFn: () => list({ root }),
    enabled: !!root, retry: false, staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const pet = !library.isError ? library.data?.pets.find((entry) => entry.key === key) : undefined;
  return { settings, root, key, library, pet };
}
export function useSelectedPet(hostId: string) {
  const data = usePetLibrary(hostId);
  const load = useRpc(loadPet);
  const { root, pet } = data;
  const asset = useQuery({
    queryKey: ["paseo-pet", "asset", hostId, root, pet?.key, pet?.revision],
    queryFn: () => load({ root, key: pet!.key, revision: pet!.revision }),
    enabled: !!pet, retry: false, staleTime: Infinity, gcTime: 0,
    refetchOnWindowFocus: false,
  });
  return { ...data, asset };
}
