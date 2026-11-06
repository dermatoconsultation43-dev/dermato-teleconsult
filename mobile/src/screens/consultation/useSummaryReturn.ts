import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { ConsultationStackParamList } from "../../navigation/consultationTypes";

// Une étape ouverte via "Modifier" depuis le résumé y revient directement une fois
// enregistrée, au lieu d'obliger à repasser par toutes les étapes suivantes.
export function useSummaryReturn() {
  const navigation = useNavigation<NativeStackNavigationProp<ConsultationStackParamList>>();
  const route = useRoute<RouteProp<ConsultationStackParamList, "Step1PersonalInfo">>();
  return {
    fromSummary: Boolean(route.params?.fromSummary),
    returnToSummary: () => navigation.popTo("Summary"),
  };
}
